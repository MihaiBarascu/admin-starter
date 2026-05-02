import { Hono } from "hono";
import { validator } from "hono/validator";
import type { AppEnv } from "../../types";
import { SAFETY_SETTING_KEYS } from "./defaults";
import { getSafetySettings, updateSafetySettings } from "./service";

export const safetyRoutes = new Hono<AppEnv>();

const SAFETY_SETTING_ALIASES = {
	publicApiEnabled: "public_api_enabled",
	emailNotificationsEnabled: "email_notifications_enabled",
	emergencyStopEnabled: "emergency_stop_enabled",
	dailyPublicWriteLimit: "daily_public_write_limit",
} as const satisfies Record<string, (typeof SAFETY_SETTING_KEYS)[number]>;

safetyRoutes.get("/", async (c) => {
	return c.json(await getSafetySettings(c.env.DB));
});

safetyRoutes.patch(
	"/",
	validator("json", (value, c) => {
		if (typeof value !== "object" || value === null || Array.isArray(value)) {
			return c.json({ error: "Body must be a JSON object." }, 400);
		}

		const updates: Partial<Record<(typeof SAFETY_SETTING_KEYS)[number], string>> = {};
		const normalized = value as Record<string, unknown>;
		for (const key of SAFETY_SETTING_KEYS) {
			const current = normalized[key];
			if (typeof current === "boolean" && key !== "daily_public_write_limit") {
				updates[key] = String(current);
			}
			if (typeof current === "number" && key === "daily_public_write_limit") {
				updates[key] = String(Math.max(1, Math.min(current, 10_000)));
			}
		}
		for (const [alias, key] of Object.entries(SAFETY_SETTING_ALIASES)) {
			const current = normalized[alias];
			if (typeof current === "boolean" && key !== "daily_public_write_limit") {
				updates[key] = String(current);
			}
			if (typeof current === "number" && key === "daily_public_write_limit") {
				updates[key] = String(Math.max(1, Math.min(current, 10_000)));
			}
		}

		if (Object.keys(updates).length === 0) {
			return c.json({ error: "No valid safety settings were provided." }, 400);
		}

		return { updates };
	}),
	async (c) => {
		await updateSafetySettings(c.env.DB, c.req.valid("json").updates);
		return c.json({ updated: true, safety: await getSafetySettings(c.env.DB) });
	},
);
