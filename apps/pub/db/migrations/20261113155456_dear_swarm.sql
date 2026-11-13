CREATE TABLE `likes` (
	`deck_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	PRIMARY KEY(`deck_id`, `user_id`)
);
--> statement-breakpoint
CREATE TABLE `public_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`deck_id` text NOT NULL,
	`parent_id` text,
	`author_id` text,
	`guest_name` text,
	`text` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`edited_at` text
);
--> statement-breakpoint
CREATE INDEX `public_comments_deck` ON `public_comments` (`deck_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `public_comments_parent` ON `public_comments` (`parent_id`);