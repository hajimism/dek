// Comment threads: stored on the version they were opened on, shown on the one asked for, placed
// again through the renames and the slide map of that version.

import { decks, renames, replies, threads } from "@schema";
import type { Context } from "hono";
import { and, asc, db, eq, inArray, sql } from "void/db";
import type {
  CommentRow,
  CommentTarget,
  NewComment,
  SlideMap,
} from "../../../../src/pub/protocol.ts";
import type { Person } from "../lib/access.ts";
import { placeComment, saysQuote } from "../lib/anchors.ts";
import { newReplyId, newThreadId } from "../lib/ids.ts";
import { type DeckRow, talkUrl, versionRow } from "./decks.ts";
import { ApiError } from "./http.ts";
import { type Account, userById, usersById } from "./users.ts";

export type ThreadRow = typeof threads.$inferSelect;

export async function slideMapOf(deck: DeckRow, n: number | null): Promise<SlideMap | null> {
  if (n === null) {
    return null;
  }
  const row = await versionRow(deck.id, n);
  return row ? (JSON.parse(row.slideMap) as SlideMap) : null;
}

export async function listComments(
  c: Context,
  deck: DeckRow,
  options: { status: "open" | "resolved" | "all"; version?: number | null },
): Promise<CommentRow[]> {
  const n = options.version ?? deck.currentVersion;
  const map = await slideMapOf(deck, n);
  const rows = await db
    .select()
    .from(threads)
    .where(eq(threads.deckId, deck.id))
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
  const renameRows = await db
    .select()
    .from(renames)
    .where(eq(renames.deckId, deck.id))
    .orderBy(asc(renames.n), asc(renames.at))
    .all();
  const owner = await userById(c, deck.ownerId);
  const people = await usersById(c, [
    ...wanted.flatMap((row) => (row.authorId ? [row.authorId] : [])),
    ...replyRows.flatMap((row) => (row.authorId ? [row.authorId] : [])),
  ]);
  const url = talkUrl(owner?.handle ?? deck.ownerId, deck.slug);

  return wanted.map((row) => {
    const targets = JSON.parse(row.targets) as CommentTarget[];
    // A thread opened on a version newer than the one shown stays as it was written.
    const placed =
      map && n !== null && row.n <= n
        ? placeComment(
            { slug: row.slug, targets, n: row.n, resolved: row.resolvedAt !== null },
            map,
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
  people: Map<string, Account>,
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

export async function openThread(
  deck: DeckRow,
  person: Person | null,
  comment: NewComment,
): Promise<ThreadRow> {
  // The version the commenter was reading, which may be older than the current one by now;
  // the thread is kept on it, so the renames since are followed when it is shown.
  const n = comment.version ?? deck.currentVersion;
  if (n !== null && n > (deck.latestVersion ?? 0)) {
    throw new ApiError(422, "unknown_version", `the deck has no version ${n}`);
  }
  const map = await slideMapOf(deck, n);
  if (n === null || !map) {
    throw new ApiError(409, "no_version", "the deck has no version to comment on yet");
  }
  const slide = map.slides.find((candidate) => candidate.slug === comment.anchor.slug);
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
  const row = await threadById(deck, id);
  if (!row) {
    throw new Error("the thread just opened is not there");
  }
  return row;
}

export async function threadById(deck: DeckRow, id: string): Promise<ThreadRow | null> {
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
): Promise<void> {
  await db.insert(replies).values({
    id: newReplyId(),
    threadId: thread.id,
    text,
    authorId: person?.id ?? null,
    guestName: person ? null : (guestName ?? null),
  });
}

/** The deck's owner, and whoever opened the thread, may resolve it or open it again. */
export function canResolve(deck: DeckRow, thread: ThreadRow, person: Person | null): boolean {
  return person !== null && (person.id === deck.ownerId || person.id === thread.authorId);
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
        ? { resolvedBy: person.id, resolvedAt: sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))` }
        : { resolvedBy: null, resolvedAt: null },
    )
    .where(eq(threads.id, thread.id));
}
