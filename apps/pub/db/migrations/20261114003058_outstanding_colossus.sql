-- void:allow-destructive
-- The side of a deck that is not the team is called its guests now: every grant on the client's
-- side moves to the guest side, and the table is made again so that a new grant's side is
-- 'guest' by default; every row is kept.
UPDATE `grants` SET `side` = 'guest' WHERE `side` = 'client';--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_grants` (
	`id` text PRIMARY KEY NOT NULL,
	`deck_id` text NOT NULL,
	`user_id` text,
	`email` text,
	`role` text NOT NULL,
	`side` text DEFAULT 'guest' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_grants`("id", "deck_id", "user_id", "email", "role", "side", "created_at") SELECT "id", "deck_id", "user_id", "email", "role", "side", "created_at" FROM `grants`;--> statement-breakpoint
DROP TABLE `grants`;--> statement-breakpoint
ALTER TABLE `__new_grants` RENAME TO `grants`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `grants_deck_user` ON `grants` (`deck_id`,`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `grants_deck_email` ON `grants` (`deck_id`,`email`);