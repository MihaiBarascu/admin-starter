import { Hono, type Context } from "hono";
import { createMiddleware } from "hono/factory";
import { jsonValidator, paramValidator, queryValidator } from "../../lib/validation";
import type { AppEnv } from "../../types";
import {
	createFormSubmission,
	deleteFormSubmission,
	FormsServiceError,
	getAppOrigins,
	getFormSubmission,
	isSubmissionOriginAllowed,
	listFormSubmissions,
	listForms,
	upsertForm,
} from "./service";
import {
	formSlugParamSchema,
	formSubmissionRequestSchema,
	listSubmissionsQuerySchema,
	submissionIdParamSchema,
	upsertFormRequestSchema,
} from "./schema";

export const formsRoutes = new Hono<AppEnv>();
export const adminFormsRoutes = new Hono<AppEnv>();

type FormsErrorStatus = 400 | 404 | 429 | 502 | 503;

const PUBLIC_SUBMISSION_CORS_MAX_AGE_SECONDS = "600";

/**
 * CORS for `POST /api/forms/:slug/submissions` only.
 *
 * The request `Origin` must be the admin app's own origin or an exact entry of
 * the form's `allowedOrigins`. Allowed origins get their exact origin echoed
 * back (never `*`, never credentials) on every response, including errors, so
 * browsers can read `{ error }`. Anything else gets a 403 without CORS headers.
 *
 * Mounted in `src/worker/index.ts` before the body limit so even 413 responses
 * stay readable by allowed sites.
 */
export const publicSubmissionCors = createMiddleware<AppEnv>(async (c, next) => {
	c.header("Vary", "Origin");
	const origin = c.req.header("Origin");
	const slug = (c.req.param("slug") ?? "").toLowerCase();
	const allowed = await isSubmissionOriginAllowed(
		c.env.DB,
		slug,
		origin,
		getAppOrigins(c.env, c.req.url),
	);
	if (!allowed || !origin) {
		return c.json({ error: "Forbidden origin." }, 403);
	}

	await next();

	c.res.headers.set("Access-Control-Allow-Origin", origin);
	c.res.headers.set("Vary", "Origin");
	if (c.req.method === "OPTIONS") {
		c.res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
		c.res.headers.set("Access-Control-Allow-Headers", "Content-Type");
		c.res.headers.set("Access-Control-Max-Age", PUBLIC_SUBMISSION_CORS_MAX_AGE_SECONDS);
	}
});

adminFormsRoutes.get("/", async (c) => {
	return c.json({ forms: await listForms(c.env.DB) });
});

adminFormsRoutes.get("/submissions", queryValidator(listSubmissionsQuerySchema), async (c) => {
	try {
		return c.json(await listFormSubmissions(c.env.DB, c.req.valid("query")));
	} catch (error) {
		return handleFormsError(c, error);
	}
});

adminFormsRoutes.get("/submissions/:id", paramValidator(submissionIdParamSchema), async (c) => {
	try {
		return c.json({ submission: await getFormSubmission(c.env.DB, c.req.valid("param").id) });
	} catch (error) {
		return handleFormsError(c, error);
	}
});

adminFormsRoutes.delete("/submissions/:id", paramValidator(submissionIdParamSchema), async (c) => {
	try {
		await deleteFormSubmission(c.env.DB, c.req.valid("param").id);
		return c.json({ deleted: true });
	} catch (error) {
		return handleFormsError(c, error);
	}
});

adminFormsRoutes.put(
	"/:slug",
	paramValidator(formSlugParamSchema),
	jsonValidator(upsertFormRequestSchema),
	async (c) => {
		const form = await upsertForm(
			c.env.DB,
			c.req.valid("param").slug,
			c.req.valid("json"),
		);
		return c.json({ form });
	},
);

// CORS preflight. Origin checks and CORS headers come from publicSubmissionCors.
formsRoutes.options("/:slug/submissions", (c) => c.body(null, 204));

formsRoutes.post(
	"/:slug/submissions",
	paramValidator(formSlugParamSchema),
	jsonValidator(formSubmissionRequestSchema),
	async (c) => {
		try {
			const result = await createFormSubmission(
				c.env,
				c.req.valid("param").slug,
				c.req.valid("json"),
				{
					origin: c.req.header("Origin"),
					ipAddress: c.req.header("cf-connecting-ip"),
					userAgent: c.req.header("User-Agent"),
					appOrigins: getAppOrigins(c.env, c.req.url),
				},
				c.executionCtx.waitUntil.bind(c.executionCtx),
			);

			return c.json({ submitted: true, id: result.id }, 201);
		} catch (error) {
			return handleFormsError(c, error);
		}
	},
);

function handleFormsError(c: Context<AppEnv>, error: unknown): Response {
	if (error instanceof FormsServiceError) {
		return c.json({ error: error.message }, error.status as FormsErrorStatus);
	}
	throw error;
}
