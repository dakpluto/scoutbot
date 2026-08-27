PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_attendance` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` integer NOT NULL,
	`scout_id` integer,
	`marked_by` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`scout_id`) REFERENCES `scouts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_attendance`("id", "event_id", "scout_id", "marked_by", "created_at") SELECT "id", "event_id", "scout_id", "marked_by", "created_at" FROM `attendance`;--> statement-breakpoint
DROP TABLE `attendance`;--> statement-breakpoint
ALTER TABLE `__new_attendance` RENAME TO `attendance`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_signups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` integer NOT NULL,
	`scout_id` integer,
	`parent_discord_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`scout_id`) REFERENCES `scouts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_signups`("id", "event_id", "scout_id", "parent_discord_id", "created_at") SELECT "id", "event_id", "scout_id", "parent_discord_id", "created_at" FROM `signups`;--> statement-breakpoint
DROP TABLE `signups`;--> statement-breakpoint
ALTER TABLE `__new_signups` RENAME TO `signups`;--> statement-breakpoint
ALTER TABLE `scouts` ADD `status` text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE `scouts` ADD `status_changed_at` integer;