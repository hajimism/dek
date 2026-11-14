CREATE TABLE `profile_links` (
	`user_id` text NOT NULL,
	`position` integer NOT NULL,
	`url` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	PRIMARY KEY(`user_id`, `position`)
);
