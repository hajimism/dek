// dek.pub's own tables. Better Auth's (user, session, account, verification, deviceCode, apikey)
// are made by Void from auth.ts. D1 holds metadata only; every file of a version is in R2.

import { sql } from "void/db";
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "void/schema-d1";

const now = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;

export const decks = sqliteTable(
  "decks",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    event: text("event"),
    talkDate: text("talk_date"),
    /** The talk's length in minutes, from the frontmatter's `duration`. */
    minutes: integer("minutes"),
    lang: text("lang"),
    visibility: text("visibility", { enum: ["private", "link", "public"] })
      .notNull()
      .default("private"),
    scriptPublic: integer("script_public", { mode: "boolean" }).notNull().default(false),
    embed: integer("embed", { mode: "boolean" }).notNull().default(false),
    comments: text("comments", { enum: ["off", "signed-in"] })
      .notNull()
      .default("signed-in"),
    currentVersion: integer("current_version"),
    latestVersion: integer("latest_version"),
    /** The next number a shared thread takes; a team thread's come from `nextTeamThread`. */
    nextThread: integer("next_thread").notNull().default(1),
    nextTeamThread: integer("next_team_thread").notNull().default(1),
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (table) => [
    uniqueIndex("decks_owner_slug").on(table.ownerId, table.slug),
    index("decks_visibility").on(table.visibility, table.updatedAt),
  ],
);

export const versions = sqliteTable(
  "versions",
  {
    deckId: text("deck_id").notNull(),
    n: integer("n").notNull(),
    dekVersion: text("dek_version").notNull(),
    /** The public build's slide map, as JSON. */
    slideMap: text("slide_map").notNull(),
    lintErrors: integer("lint_errors").notNull(),
    lintWarnings: integer("lint_warnings").notNull(),
    bytes: integer("bytes").notNull(),
    message: text("message"),
    /** sha256 by file name, as JSON. */
    files: text("files").notNull(),
    /** sha256 by slug of each slide's picture, as JSON. */
    shots: text("shots").notNull(),
    /** Slugs whose slide or script differs from the version before, as JSON. */
    changed: text("changed").notNull(),
    createdAt: text("created_at").notNull().default(now),
  },
  (table) => [primaryKey({ columns: [table.deckId, table.n] })],
);

export const renames = sqliteTable(
  "renames",
  {
    deckId: text("deck_id").notNull(),
    fromSlug: text("from_slug").notNull(),
    toSlug: text("to_slug").notNull(),
    at: text("at").notNull(),
    /** The version the rename arrived with. */
    n: integer("n").notNull(),
  },
  (table) => [primaryKey({ columns: [table.deckId, table.fromSlug, table.toSlug, table.at] })],
);

export const threads = sqliteTable(
  "threads",
  {
    id: text("id").primaryKey(),
    deckId: text("deck_id").notNull(),
    /** Per deck and scope, so a guest cannot count the team's threads by the gaps. */
    number: integer("number").notNull(),
    scope: text("scope", { enum: ["team", "shared"] })
      .notNull()
      .default("team"),
    /** The version the thread was opened on. */
    n: integer("n").notNull(),
    slug: text("slug").notNull(),
    step: text("step").notNull(),
    /** The comment's targets, as protocol CommentTarget[] JSON. */
    targets: text("targets").notNull(),
    text: text("text").notNull(),
    authorId: text("author_id").notNull(),
    resolvedBy: text("resolved_by"),
    resolvedAt: text("resolved_at"),
    createdAt: text("created_at").notNull().default(now),
  },
  (table) => [
    uniqueIndex("threads_deck_number").on(table.deckId, table.scope, table.number),
    index("threads_deck_slug").on(table.deckId, table.slug),
  ],
);

export const replies = sqliteTable(
  "replies",
  {
    id: text("id").primaryKey(),
    threadId: text("thread_id").notNull(),
    text: text("text").notNull(),
    authorId: text("author_id").notNull(),
    createdAt: text("created_at").notNull().default(now),
  },
  (table) => [index("replies_thread").on(table.threadId, table.createdAt)],
);

export const grants = sqliteTable(
  "grants",
  {
    id: text("id").primaryKey(),
    deckId: text("deck_id").notNull(),
    /** Set once the grant names an account; until then it waits on `email`. */
    userId: text("user_id"),
    email: text("email"),
    role: text("role", { enum: ["view", "comment"] }).notNull(),
    side: text("side", { enum: ["team", "guest"] })
      .notNull()
      .default("guest"),
    createdAt: text("created_at").notNull().default(now),
  },
  (table) => [
    uniqueIndex("grants_deck_user").on(table.deckId, table.userId),
    uniqueIndex("grants_deck_email").on(table.deckId, table.email),
  ],
);

/** A deck whose comments one person hears nothing of by mail. */
export const mutes = sqliteTable(
  "mutes",
  {
    userId: text("user_id").notNull(),
    deckId: text("deck_id").notNull(),
    createdAt: text("created_at").notNull().default(now),
  },
  (table) => [primaryKey({ columns: [table.userId, table.deckId] })],
);

/**
 * The comments at the bottom of a talk anyone may open, on the talk as a whole. A reply names the
 * comment it answers; replies answer top-level comments only.
 */
export const publicComments = sqliteTable(
  "public_comments",
  {
    id: text("id").primaryKey(),
    deckId: text("deck_id").notNull(),
    parentId: text("parent_id"),
    authorId: text("author_id").notNull(),
    text: text("text").notNull(),
    createdAt: text("created_at").notNull().default(now),
    editedAt: text("edited_at"),
  },
  (table) => [
    index("public_comments_deck").on(table.deckId, table.createdAt),
    index("public_comments_parent").on(table.parentId),
  ],
);

/** One account's like of one talk. */
export const likes = sqliteTable(
  "likes",
  {
    deckId: text("deck_id").notNull(),
    userId: text("user_id").notNull(),
    createdAt: text("created_at").notNull().default(now),
  },
  (table) => [primaryKey({ columns: [table.deckId, table.userId] })],
);
