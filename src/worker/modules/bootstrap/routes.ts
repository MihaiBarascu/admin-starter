import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { validator } from "hono/validator";
import { createAuth } from "../../auth";
import { getDb } from "../../db/client";
import { user } from "../../db/schema";
import { constantTimeEqual } from "../../lib/security";
import type { AppEnv } from "../../types";

export const bootstrapRoutes = new Hono<AppEnv>();

bootstrapRoutes.post(
	"/",
	validator("json", (value, c) => {
		if (typeof value !== "object" || value === null || Array.isArray(value)) {
			return c.json({ error: "Body must be a JSON object." }, 400);
		}

		const name = typeof value.name === "string" ? value.name.trim() : "";
		const email = typeof value.email === "string" ? value.email.trim().toLowerCase() : "";
		const password = typeof value.password === "string" ? value.password : "";
		const bootstrapToken = typeof value.bootstrapToken === "string" ? value.bootstrapToken : "";

		if (!name || !email || !password || !bootstrapToken) {
			return c.json({ error: "name, email, password and bootstrapToken are required." }, 400);
		}
		if (password.length < 12 || password.length > 128) {
			return c.json({ error: "Password must contain between 12 and 128 characters." }, 400);
		}

		return { name, email, password, bootstrapToken };
	}),
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
