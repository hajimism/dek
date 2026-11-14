CREATE TABLE `invitations` (
	`inviter_id` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `invitations_inviter` ON `invitations` (`inviter_id`,`created_at`);