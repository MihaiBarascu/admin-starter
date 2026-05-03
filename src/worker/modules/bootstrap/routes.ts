import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { createAuth } from "../../auth";
import { getDb } from "../../db/client";
import { user } from "../../db/schema";
import { constantTimeEqual } from "../../lib/security";
import { jsonValidator } from "../../lib/validation";
import type { AppEnv } from "../../types";
import { bootstrapRequestSchema } from "./schema";

export const bootstrapRoutes = new Hono<AppEnv>();

async function isBootstrapAvailable(env: AppEnv["Bindings"]) {
	const db = getDb(env);
	const existing = await db.select({ id: user.id }).from(user).limit(1);
	return existing.length === 0;
}

bootstrapRoutes.get("/", async (c) => {
	return c.json({
		available: await isBootstrapAvailable(c.env),
	});
});

bootstrapRoutes.post(
	"/",
	jsonValidator(bootstrapRequestSchema),
	async (c) => {
		if (!c.env.BOOTSTRAP_ADMIN_TOKEN) {
			throw new HTTPException(404, { message: "Bootstrap is disabled." });
		}

		const payload = c.req.valid("json");
		if (!constantTimeEqual(payload.bootstrapToken, c.env.BOOTSTRAP_ADMIN_TOKEN)) {
			return c.json({ error: "Invalid bootstrap token." }, 401);
		}

		const db = getDb(c.env);
		const existing = await db.select({ id: user.id }).from(user).limit(1);
		if (existing.length > 0) {
			return c.json({ error: "An admin user already exists." }, 409);
		}

		await createAuth(c.env, { allowSignUp: true }).api.signUpEmail({
			body: {
				name: payload.name,
				email: payload.email,
				password: payload.password,
			},
		});

		return c.json({ bootstrapped: true }, 201);
	},
);
