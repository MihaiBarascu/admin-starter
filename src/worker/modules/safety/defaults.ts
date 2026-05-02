export const SAFETY_SETTING_KEYS = [
	"public_api_enabled",
	"email_notifications_enabled",
	"emergency_stop_enabled",
	"daily_public_write_limit",
] as const;

export const SAFETY_DEFAULTS = {
	public_api_enabled: "true",
	email_notifications_enabled: "true",
	emergency_stop_enabled: "false",
	daily_public_write_limit: "100",
} satisfies Record<(typeof SAFETY_SETTING_KEYS)[number], string>;
