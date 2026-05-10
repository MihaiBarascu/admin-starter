CREATE TABLE `admin_profile` (
	`user_id` text PRIMARY KEY NOT NULL,
	`role` text DEFAULT 'admin' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `admin_profile` (`user_id`, `role`, `created_at`, `updated_at`)
SELECT
	`id`,
	'admin',
	cast(unixepoch('subsecond') * 1000 as integer),
	cast(unixepoch('subsecond') * 1000 as integer)
FROM `user`
WHERE `id` NOT IN (SELECT `user_id` FROM `admin_profile`);
