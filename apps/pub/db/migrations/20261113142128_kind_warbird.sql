-- void:allow-destructive
-- The one index dropped is made again over (deck_id, scope, number); no row is lost.
DROP INDEX `threads_deck_number`;--> statement-breakpoint
ALTER TABLE `threads` ADD `scope` text DEFAULT 'team' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `threads_deck_number` ON `threads` (`deck_id`,`scope`,`number`);--> statement-breakpoint
ALTER TABLE `decks` ADD `next_team_thread` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `grants` ADD `side` text DEFAULT 'client' NOT NULL;