-- void:allow-destructive
-- Only accounts write comments now: a deck that let guests in lets anyone signed in, and what
-- guests wrote goes, with the replies under it. The three tables are made again with author_id
-- NOT NULL and no guest_name; every other row is kept.
UPDATE `decks` SET `comments` = 'signed-in' WHERE `comments` = 'guests';--> statement-breakpoint
DELETE FROM `replies` WHERE `author_id` IS NULL OR `thread_id` IN (SELECT `id` FROM `threads` WHERE `author_id` IS NULL);--> statement-breakpoint
DELETE FROM `threads` WHERE `author_id` IS NULL;--> statement-breakpoint
DELETE FROM `public_comments` WHERE `author_id` IS NULL OR `parent_id` IN (SELECT `id` FROM `public_comments` WHERE `author_id` IS NULL);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_public_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`deck_id` text NOT NULL,
	`parent_id` text,
	`author_id` text NOT NULL,
	`text` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`edited_at` text
);
--> statement-breakpoint
INSERT INTO `__new_public_comments`("id", "deck_id", "parent_id", "author_id", "text", "created_at", "edited_at") SELECT "id", "deck_id", "parent_id", "author_id", "text", "created_at", "edited_at" FROM `public_comments`;--> statement-breakpoint
DROP TABLE `public_comments`;--> statement-breakpoint
ALTER TABLE `__new_public_comments` RENAME TO `public_comments`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `public_comments_deck` ON `public_comments` (`deck_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `public_comments_parent` ON `public_comments` (`parent_id`);--> statement-breakpoint
CREATE TABLE `__new_replies` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`text` text NOT NULL,
	`author_id` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_replies`("id", "thread_id", "text", "author_id", "created_at") SELECT "id", "thread_id", "text", "author_id", "created_at" FROM `replies`;--> statement-breakpoint
DROP TABLE `replies`;--> statement-breakpoint
ALTER TABLE `__new_replies` RENAME TO `replies`;--> statement-breakpoint
CREATE INDEX `replies_thread` ON `replies` (`thread_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `__new_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`deck_id` text NOT NULL,
	`number` integer NOT NULL,
	`scope` text DEFAULT 'team' NOT NULL,
	`n` integer NOT NULL,
	`slug` text NOT NULL,
	`step` text NOT NULL,
	`targets` text NOT NULL,
	`text` text NOT NULL,
	`author_id` text NOT NULL,
	`resolved_by` text,
	`resolved_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_threads`("id", "deck_id", "number", "scope", "n", "slug", "step", "targets", "text", "author_id", "resolved_by", "resolved_at", "created_at") SELECT "id", "deck_id", "number", "scope", "n", "slug", "step", "targets", "text", "author_id", "resolved_by", "resolved_at", "created_at" FROM `threads`;--> statement-breakpoint
DROP TABLE `threads`;--> statement-breakpoint
ALTER TABLE `__new_threads` RENAME TO `threads`;--> statement-breakpoint
CREATE UNIQUE INDEX `threads_deck_number` ON `threads` (`deck_id`,`scope`,`number`);--> statement-breakpoint
CREATE INDEX `threads_deck_slug` ON `threads` (`deck_id`,`slug`);