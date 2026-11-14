CREATE TABLE `sign_up_invites` (
	`id` text PRIMARY KEY NOT NULL,
	`entry` text NOT NULL,
	`added_by` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`claimed_by` text,
	`claimed_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sign_up_invites_entry` ON `sign_up_invites` (`entry`);