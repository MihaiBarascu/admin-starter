import { createMiddleware } from "hono/factory";
import { bodyLimit } from "hono/body-limit";
import { parseCsv } from "../lib/env";
import type { AppEnv } from "../types";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export const apiBodyLimit = bodyLimit({
	maxSize: 32 * 1024,
	onError: (c) => {
		return c.json({ error: "Request body too large." }, 413);
	},
});

export const requireTrustedOrigin = createMiddleware<AppEnv>(async (c, next) => {
	if (SAFE_METHODS.has(c.req.method)) {
		await next();
		return;
	}

	const origin = c.req.header("Origin");
	const trustedOrigins = new Set(parseCsv(c.env.AUTH_TRUSTED_ORIGINS));
	if (c.env.BETTER_AUTH_URL) {
		trustedOrigins.add(c.env.BETTER_AUTH_URL);
	}

	if (!origin || !trustedOrigins.has(origin)) {
		return c.json({ error: "Forbidden origin." }, 403);
	}

	await next();
});
