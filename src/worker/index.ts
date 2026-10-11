import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { except } from "hono/combine";
import { secureHeaders } from "hono/secure-headers";
import { createAuth } from "./auth";
import { requireAdminSession } from "./auth/middleware";
import { bootstrapRoutes } from "./modules/bootstrap/routes";
import {
	adminFormsRoutes,
	formsRoutes,
	publicSubmissionCors,
} from "./modules/forms/routes";
import { healthRoutes } from "./modules/health/routes";
import { meRoutes } from "./modules/me/routes";
import { safetyRoutes } from "./modules/safety/routes";
import { apiBodyLimit, requireTrustedOrigin } from "./middleware/request-guards";
import type { AppEnv } from "./types";

const app = new Hono<AppEnv>();

app.use(
	"*",
	secureHeaders({
		contentSecurityPolicy: {
			defaultSrc: ["'self'"],
			baseUri: ["'self'"],
			objectSrc: ["'none'"],
			frameAncestors: ["'none'"],
			scriptSrc: ["'self'"],
			styleSrc: ["'self'", "'unsafe-inline'"],
			imgSrc: ["'self'", "data:"],
			fontSrc: ["'self'"],
			connectSrc: ["'self'"],
			formAction: ["'self'"],
		},
		permissionsPolicy: {
			camera: false,
			microphone: false,
			geolocation: false,
			payment: false,
		},
		xFrameOptions: "DENY",
	}),
);
// Public form submissions are called cross-origin by static sites. Their
// origin check is per form (allowedOrigins) and lives in publicSubmissionCors,
// registered before the body limit so even 413 responses carry CORS headers.
app.use("/api/forms/:slug/submissions", publicSubmissionCors);
app.use("/api/*", apiBodyLimit);
// Auth, admin and every other unsafe /api/* request still require an
// AUTH_TRUSTED_ORIGINS origin. Only the public forms routes are excluded.
app.use("/api/*", except("/api/forms/*", requireTrustedOrigin));

app.get("/api/", (c) => {
	return c.json({
		name: c.env.APP_NAME ?? "Multiwebsite Admin Starter",
		runtime: "Cloudflare Workers",
	});
});

app.route("/api/health", healthRoutes);
app.route("/api/forms", formsRoutes);

app.on(["POST", "GET"], "/api/auth/*", (c) => {
	return createAuth(c.env, {
		waitUntil: c.executionCtx.waitUntil.bind(c.executionCtx),
	}).handler(c.req.raw);
});

app.route("/api/admin/bootstrap", bootstrapRoutes);
app.use("/api/admin/*", requireAdminSession);
app.route("/api/admin/forms", adminFormsRoutes);
app.route("/api/admin/me", meRoutes);
app.route("/api/admin/safety", safetyRoutes);

app.onError((error, c) => {
	if (error instanceof HTTPException) {
		if (error.res) {
			return error.getResponse();
		}
		// Keep the `{ error }` JSON contract for framework errors such as
		// malformed JSON bodies.
		return c.json({ error: error.message || "Request failed." }, error.status);
	}
	console.error("Unhandled Worker error", error);
	return c.json({ error: "Internal server error." }, 500);
});

app.notFound((c) => c.json({ error: "Not found." }, 404));

export default app;
