import { Hono } from "hono";
import type { AppEnv } from "../../types";

export const meRoutes = new Hono<AppEnv>().get("/", (c) => {
	const session = c.get("session");

	return c.json({
		user: c.get("user"),
		session: session
			? {
					id: session.id,
					userId: session.userId,
					expiresAt: session.expiresAt,
					ipAddress: session.ipAddress,
					userAgent: session.userAgent,
					createdAt: session.createdAt,
					updatedAt: session.updatedAt,
				}
			: null,
	});
});
