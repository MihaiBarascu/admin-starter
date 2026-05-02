import { Hono } from "hono";
import type { AppEnv } from "../../types";

export const healthRoutes = new Hono<AppEnv>().get("/", (c) => {
	return c.json({ status: "ok", timestamp: Date.now() });
});
