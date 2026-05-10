import { Hono } from "hono";
import { jsonValidator, paramValidator } from "../../lib/validation";
import type { AppEnv } from "../../types";
import {
	createFormSubmission,
	FormsServiceError,
	listForms,
	upsertForm,
} from "./service";
import {
	formSlugParamSchema,
	formSubmissionRequestSchema,
	upsertFormRequestSchema,
} from "./schema";

export const formsRoutes = new Hono<AppEnv>();
export const adminFormsRoutes = new Hono<AppEnv>();

type FormsErrorStatus = 400 | 404 | 429 | 502 | 503;

adminFormsRoutes.get("/", async (c) => {
	return c.json({ forms: await listForms(c.env.DB) });
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
				},
				c.executionCtx.waitUntil.bind(c.executionCtx),
			);

			return c.json({ submitted: true, id: result.id }, 201);
		} catch (error) {
			if (error instanceof FormsServiceError) {
				return c.json({ error: error.message }, error.status as FormsErrorStatus);
			}
			throw error;
		}
	},
);
