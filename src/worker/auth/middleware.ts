import { createMiddleware } from "hono/factory";
import { createAuth } from "../auth";
import { isAdminUser } from "../modules/admin-users/service";
import type { AppEnv } from "../types";

export const requireAdminSession = createMiddleware<AppEnv>(async (c, next) => {
	const session = await createAuth(c.env).api.getSession({ headers: c.req.raw.headers });
	if (!session) {
		return c.json({ error: "Unauthorized." }, 401);
	}
	if (!(await isAdminUser(c.env.DB, session.user.id))) {
		return c.json({ error: "Forbidden." }, 403);
	}

	c.set("user", session.user);
	c.set("session", session.session);
	await next();
});
