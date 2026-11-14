-- void:allow-destructive
-- A deck may be kept to its team now, and a new deck is: the table is made again so that its
-- visibility defaults to team. Every deck made before keeps the visibility it has.
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_decks` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`event` text,
	`talk_date` text,
	`minutes` integer,
	`lang` text,
	`visibility` text DEFAULT 'team' NOT NULL,
	`script_public` integer DEFAULT false NOT NULL,
	`embed` integer DEFAULT false NOT NULL,
	`comments` text DEFAULT 'signed-in' NOT NULL,
	`current_version` integer,
	`latest_version` integer,
	`next_thread` integer DEFAULT 1 NOT NULL,
	`next_team_thread` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_decks`("id", "owner_id", "slug", "title", "description", "event", "talk_date", "minutes", "lang", "visibility", "script_public", "embed", "comments", "current_version", "latest_version", "next_thread", "next_team_thread", "created_at", "updated_at") SELECT "id", "owner_id", "slug", "title", "description", "event", "talk_date", "minutes", "lang", "visibility", "script_public", "embed", "comments", "current_version", "latest_version", "next_thread", "next_team_thread", "created_at", "updated_at" FROM `decks`;--> statement-breakpoint
DROP TABLE `decks`;--> statement-breakpoint
ALTER TABLE `__new_decks` RENAME TO `decks`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `decks_owner_slug` ON `decks` (`owner_id`,`slug`);--> statement-breakpoint
CREATE INDEX `decks_visibility` ON `decks` (`visibility`,`updated_at`);