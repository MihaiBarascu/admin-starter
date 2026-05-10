import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const appSetting = sqliteTable("app_setting", {
	key: text("key").primaryKey(),
	value: text("value").notNull(),
	updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const form = sqliteTable("form", {
	id: text("id").primaryKey(),
	slug: text("slug").notNull().unique(),
	name: text("name").notNull(),
	enabled: integer("enabled", { mode: "boolean" }).default(true).notNull(),
	schemaJson: text("schema_json").notNull(),
	notificationEmail: text("notification_email"),
	turnstileRequired: integer("turnstile_required", { mode: "boolean" })
		.default(false)
		.notNull(),
	createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
	updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const formSubmission = sqliteTable(
	"form_submission",
	{
		id: text("id").primaryKey(),
		formId: text("form_id")
			.notNull()
			.references(() => form.id, { onDelete: "cascade" }),
		payloadJson: text("payload_json").notNull(),
		submitterEmail: text("submitter_email"),
		origin: text("origin"),
		ipHash: text("ip_hash"),
		userAgent: text("user_agent"),
		createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
	},
	(table) => [
		index("form_submission_form_created_at_idx").on(table.formId, table.createdAt),
		index("form_submission_created_at_idx").on(table.createdAt),
	],
);
