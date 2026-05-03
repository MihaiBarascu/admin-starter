import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { constantTimeEqual } from "../../lib/security";
import { jsonValidator } from "../../lib/validation";
import { createAdminUser, hasAnyUser } from "../admin-users/service";
import type { AppEnv } from "../../types";
import { bootstrapRequestSchema } from "./schema";

export const bootstrapRoutes = new Hono<AppEnv>();

async function isBootstrapAvailable(env: AppEnv["Bindings"]) {
	return !(await hasAnyUser(env));
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

		if (await hasAnyUser(c.env)) {
			return c.json({ error: "An admin user already exists." }, 409);
		}

		await createAdminUser(c.env, {
			name: payload.name,
			email: payload.email,
			password: payload.password,
		});

		return c.json({ bootstrapped: true }, 201);
	},
);
