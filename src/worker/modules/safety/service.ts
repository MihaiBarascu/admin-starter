import { inArray } from "drizzle-orm";
import { getDb } from "../../db/client";
import { appSetting } from "../../db/schema";
import { isEnabled } from "../../lib/env";
import { SAFETY_DEFAULTS, SAFETY_SETTING_KEYS } from "./defaults";

export interface SafetySettings {
	settings: Record<(typeof SAFETY_SETTING_KEYS)[number], string>;
	status: {
		publicApiEnabled: boolean;
		emailNotificationsEnabled: boolean;
		emergencyStopEnabled: boolean;
	};
}

export async function getSafetySettings(dbBinding: D1Database): Promise<SafetySettings> {
	const db = getDb({ DB: dbBinding });
	const rows = await db
		.select()
		.from(appSetting)
		.where(inArray(appSetting.key, [...SAFETY_SETTING_KEYS]));
	const settings = new Map(rows.map((row) => [row.key, row.value]));
	const resolved = Object.fromEntries(
		SAFETY_SETTING_KEYS.map((key) => [key, settings.get(key) ?? SAFETY_DEFAULTS[key]]),
	) as SafetySettings["settings"];

	return {
		settings: resolved,
		status: {
			publicApiEnabled: isEnabled(resolved.public_api_enabled, true),
			emailNotificationsEnabled: isEnabled(resolved.email_notifications_enabled, true),
			emergencyStopEnabled: isEnabled(resolved.emergency_stop_enabled, false),
		},
	};
}

export async function updateSafetySettings(
	dbBinding: D1Database,
	updates: Partial<Record<(typeof SAFETY_SETTING_KEYS)[number], string>>,
): Promise<void> {
	const db = getDb({ DB: dbBinding });
	const now = new Date();

	for (const [key, value] of Object.entries(updates)) {
		await db
			.insert(appSetting)
			.values({ key, value, updatedAt: now })
			.onConflictDoUpdate({
				target: appSetting.key,
				set: { value, updatedAt: now },
			});
	}
}
