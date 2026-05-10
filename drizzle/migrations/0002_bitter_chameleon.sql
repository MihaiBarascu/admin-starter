CREATE TABLE `form` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`schema_json` text NOT NULL,
	`notification_email` text,
	`turnstile_required` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `form_slug_unique` ON `form` (`slug`);--> statement-breakpoint
CREATE TABLE `form_submission` (
	`id` text PRIMARY KEY NOT NULL,
	`form_id` text NOT NULL,
	`payload_json` text NOT NULL,
	`submitter_email` text,
	`origin` text,
	`ip_hash` text,
	`user_agent` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`form_id`) REFERENCES `form`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `form_submission_form_created_at_idx` ON `form_submission` (`form_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `form_submission_created_at_idx` ON `form_submission` (`created_at`);