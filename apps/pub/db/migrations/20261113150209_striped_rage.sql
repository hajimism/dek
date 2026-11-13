CREATE TABLE `mutes` (
	`user_id` text NOT NULL,
	`deck_id` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	PRIMARY KEY(`user_id`, `deck_id`)
);
