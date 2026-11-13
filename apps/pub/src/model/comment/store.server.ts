// Comment threads: stored on the version they were opened on, shown on the one asked for, placed
// again through the renames and the slide map of that version. Opening a thread takes its number
// from the deck's own counter, the one write a comment makes to the deck.

import { decks, replies, threads } from "@schema";
import type { Context } from "hono";
import { and, asc, db, eq, inArray, sql } from "void/db";
import type { CommentRow, NewComment } from "../../../../../src/pub/protocol.ts";
import { ApiError, notFound } from "../../common/api-error.ts";
import { now } from "../../common/db.server.ts";
import { newReplyId, newThreadId } from "../../common/ids.ts";
import { readJson } from "../../common/json.ts";
import { canSeeScript, mayCommentOnVersion } from "../deck/access.ts";
import { talkUrl } from "../deck/store.server.ts";
import type { Deck } from "../deck/type.ts";
import { findVersion, renamesOf } from "../deck/version/store.server.ts";
import { peopleById } from "../person/store.server.ts";
import type { Person } from "../person/type.ts";
import { placeComment, saysQuote } from "./anchor.ts";
import { CommentTargets, type ThreadRow } from "./type.ts";
import { hideQuotes } from "./view.ts";

type Status = "open" | "resolved" | "all";

async function listComments(
  c: Context,
  deck: Deck,
  options: { status: Status; version?: number | null; id?: string },
): Promise<CommentRow[]> {
  const n = options.version ?? deck.currentVersion;
  const version = n === null ? null : await findVersion(deck.id, n);
  const rows = await db
    .select()
    .from(threads)
    .where(
      options.id
        ? and(eq(threads.deckId, deck.id), eq(threads.id, options.id))
        : eq(threads.deckId, deck.id),
    )
    .orderBy(asc(threads.number))
    .all();
  const wanted = rows.filter((row) =>
    options.status === "all"
      ? true
      : options.status === "resolved"
        ? row.resolvedAt !== null
        : row.resolvedAt === null,
  );
  if (wanted.length === 0) {
    return [];
  }
  const replyRows = await db
    .select()
    .from(replies)
    .where(
      inArray(
        replies.threadId,
        wanted.map((row) => row.id),
      ),
    )
    .orderBy(asc(replies.createdAt))
    .all();
  const renameRows = await renamesOf(deck.id);
  const people = await peopleById(c, [
    ...wanted.flatMap((row) => (row.authorId ? [row.authorId] : [])),
    ...replyRows.flatMap((row) => (row.authorId ? [row.authorId] : [])),
  ]);
  const url = await talkUrl(c, deck);

  return wanted.map((row) => {
    const targets = readJson(CommentTargets, row.targets);
    // A thread opened on a version newer than the one shown stays as it was written.
    const placed =
      version && n !== null && row.n <= n
        ? placeComment(
            { slug: row.slug, targets, n: row.n, resolved: row.resolvedAt !== null },
            version.slideMap,
            renameRows,
            n,
          )
        : { slug: row.slug, status: row.resolvedAt ? ("resolved" as const) : ("open" as const) };
    return {
      number: row.number,
      id: row.id,
      slug: placed.slug,
      step: row.step,
      status: placed.status,
      text: row.text,
      targets,
      author: author(row, people),
      version: row.n,
      url: `${url}#${row.id}`,
      thread: replyRows
        .filter((reply) => reply.threadId === row.id)
        .map((reply) => ({
          id: reply.id,
          author: author(reply, people),
          text: reply.text,
          createdAt: reply.createdAt,
        })),
      createdAt: row.createdAt,
      resolvedAt: row.resolvedAt,
    };
  });
}

function author(
  row: { authorId: string | null; guestName: string | null },
  people: Map<string, Person>,
) {
  if (row.authorId) {
    const person = people.get(row.authorId);
    return {
      name: person?.name ?? "someone",
      handle: person?.handle ?? row.authorId,
      guest: false,
    };
  }
  return { name: row.guestName ?? "guest", guest: true };
}

/**
 * A deck's comments as `person` reads them, placed on `version` (the current one when absent).
 * A quoted passage is part of the script, so someone the script is hidden from gets each comment
 * without it.
 */
export async function commentsFor(
  c: Context,
  deck: Deck,
  person: Person | null,
  options: { status: Status; version?: number | null },
): Promise<CommentRow[]> {
  const rows = await listComments(c, deck, options);
  return canSeeScript(deck, person) ? rows : rows.map(hideQuotes);
}

/** One comment as `person` reads it, after they changed it or replied to it. */
export async function commentFor(
  c: Context,
  deck: Deck,
  person: Person | null,
  id: string,
): Promise<CommentRow> {
  const [row] = await listComments(c, deck, { status: "all", id });
  if (!row) {
    throw notFound("comment");
  }
  return canSeeScript(deck, person) ? row : hideQuotes(row);
}

export async function openThread(
  deck: Deck,
  person: Person | null,
  comment: NewComment,
): Promise<string> {
  // The version the commenter was reading, which may be older than the current one by now;
  // the thread is kept on it, so the renames since are followed when it is shown.
  const n = comment.version ?? deck.currentVersion;
  if (n !== null && !mayCommentOnVersion(deck, person, n)) {
    throw new ApiError(422, "unknown_version", `the deck has no version ${n}`);
  }
  // Whether a passage is in the script is the script's to tell, so one it is hidden from may not
  // quote it at all.
  if (
    !canSeeScript(deck, person) &&
    comment.anchor.targets.some((target) => target.kind === "quote")
  ) {
    throw new ApiError(403, "script_hidden", "the script is not public, so it cannot be quoted");
  }
  const version = n === null ? null : await findVersion(deck.id, n);
  if (n === null || !version) {
    throw new ApiError(409, "no_version", "the deck has no version to comment on yet");
  }
  const slide = version.slideMap.slides.find((candidate) => candidate.slug === comment.anchor.slug);
  if (!slide) {
    throw new ApiError(422, "unknown_slide", `the deck has no slide ${comment.anchor.slug}`);
  }
  if (!slide.steps.some((step) => step.step === comment.anchor.step)) {
    throw new ApiError(
      422,
      "unknown_step",
      `slide ${slide.slug} has no step ${comment.anchor.step}`,
    );
  }
  for (const target of comment.anchor.targets) {
    if (target.kind === "quote" && !saysQuote(slide.paragraphs, target.quote)) {
      throw new ApiError(
        422,
        "unknown_quote",
        `slide ${slide.slug} does not say the quoted passage`,
      );
    }
  }
  const [counter] = await db
    .update(decks)
    .set({ nextThread: sql`${decks.nextThread} + 1` })
    .where(eq(decks.id, deck.id))
    .returning({ next: decks.nextThread });
  const id = newThreadId();
  await db.insert(threads).values({
    id,
    deckId: deck.id,
    number: (counter?.next ?? 2) - 1,
    n,
    slug: comment.anchor.slug,
    step: comment.anchor.step,
    targets: JSON.stringify(comment.anchor.targets),
    text: comment.text,
    authorId: person?.id ?? null,
    guestName: person ? null : (comment.guestName ?? null),
  });
  return id;
}

export async function threadById(deck: Deck, id: string): Promise<ThreadRow | null> {
  return (
    (await db
      .select()
      .from(threads)
      .where(and(eq(threads.deckId, deck.id), eq(threads.id, id)))
      .get()) ?? null
  );
}

export async function addReply(
  thread: ThreadRow,
  person: Person | null,
  text: string,
  guestName?: string,
): Promise<string> {
  const id = newReplyId();
  await db.insert(replies).values({
    id,
    threadId: thread.id,
    text,
    authorId: person?.id ?? null,
    guestName: person ? null : (guestName ?? null),
  });
  return id;
}

export async function setResolved(
  thread: ThreadRow,
  person: Person,
  resolved: boolean,
): Promise<void> {
  await db
    .update(threads)
    .set(
      resolved
        ? { resolvedBy: person.id, resolvedAt: now }
        : { resolvedBy: null, resolvedAt: null },
    )
    .where(eq(threads.id, thread.id));
}
