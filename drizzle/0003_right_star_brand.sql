CREATE TABLE `event_templates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`guild_id` text NOT NULL,
	`name` text NOT NULL,
	`start_time` text,
	`end_time` text,
	`location` text,
	`details` text,
	`auto_add_all_dens` integer DEFAULT false NOT NULL,
	`uniform_type` text,
	`uniform_other_text` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`guild_id`) REFERENCES `guilds`(`id`) ON UPDATE no action ON DELETE no action
);
