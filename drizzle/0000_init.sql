CREATE TABLE `ad_library` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`show_id` integer NOT NULL,
	`kind` text NOT NULL,
	`source` text NOT NULL,
	`fingerprint` blob NOT NULL,
	`duration_sec` real NOT NULL,
	`hits` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`show_id`) REFERENCES `shows`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ad_library_show` ON `ad_library` (`show_id`);--> statement-breakpoint
CREATE TABLE `ad_segments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`episode_id` integer NOT NULL,
	`start_sec` real NOT NULL,
	`end_sec` real NOT NULL,
	`start_byte` integer,
	`end_byte` integer,
	`source` text NOT NULL,
	`position` text,
	`label` text,
	`confidence` real NOT NULL,
	`applied` integer DEFAULT true NOT NULL,
	`fingerprint` blob,
	FOREIGN KEY (`episode_id`) REFERENCES `episodes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ad_segments_episode` ON `ad_segments` (`episode_id`);--> statement-breakpoint
CREATE TABLE `episode_fingerprints` (
	`episode_id` integer PRIMARY KEY NOT NULL,
	`fingerprint` blob NOT NULL,
	FOREIGN KEY (`episode_id`) REFERENCES `episodes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `episodes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`show_id` integer NOT NULL,
	`guid` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`link` text,
	`image_url` text,
	`pub_date` integer NOT NULL,
	`season` integer,
	`episode_number` integer,
	`episode_type` text,
	`explicit` integer DEFAULT false NOT NULL,
	`source_url` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`stage` text,
	`error` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer,
	`detector` text,
	`original_bytes` integer,
	`original_duration` real,
	`output_path` text,
	`output_bytes` integer,
	`output_duration` real,
	`ad_seconds` real,
	`processed_at` integer,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`show_id`) REFERENCES `shows`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `episodes_show_guid` ON `episodes` (`show_id`,`guid`);--> statement-breakpoint
CREATE INDEX `episodes_status` ON `episodes` (`status`);--> statement-breakpoint
CREATE TABLE `shows` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`apple_id` text,
	`feed_url` text NOT NULL,
	`title` text NOT NULL,
	`author` text,
	`description` text,
	`artwork_url` text,
	`link` text,
	`language` text,
	`categories` text DEFAULT '[]' NOT NULL,
	`explicit` integer DEFAULT false NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`last_polled_at` integer,
	`last_poll_error` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shows_slug_unique` ON `shows` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `shows_feed_url_unique` ON `shows` (`feed_url`);