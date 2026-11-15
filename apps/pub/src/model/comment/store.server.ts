// Comment threads: stored on the version they were opened on, shown on the current one, placed
// again through the renames and the slide map of that version, to the side of the work that may
// read them. Opening a thread takes its number from the deck's own counter for its scope, the one
// write a comment makes to the deck; sharing a team thread takes the next shared number.

import { decks, replies, threads } from "@schema";
import type { Context } from "hono";
import { and, asc, db, eq, exists, inArray, sql } from "void/db";
import type {
  CommentRow,
  GrantRole,
  GrantSide,
  NewComment,
  ThreadScope,
} from "../../../../../src/pub/protocol.ts";
import { notFound } from "../../common/api-error.ts";
import { chunks, IDS_PER_QUERY } from "../../common/chunks.ts";
import { now } from "../../common/db.server.ts";
import { newReplyId, newThreadId } from "../../common/ids.ts";
import { readJson } from "../../common/json.ts";
import { canSeeScript } from "../deck/access.ts";
import { requestedDeck, talkUrl } from "../deck/store.server.ts";
import type { Deck, Standing } from "../deck/type.ts";
import { currentVersionOf, renamesOf } from "../deck/version/store.server.ts";
import { authorOf } from "../person/person.ts";
import { peopleById } from "../person/store.server.ts";
import type { Account, Caller, Person } from "../person/type.ts";
import { canReadThread, canSeeThread, mustResolve, scopeFor, type ThreadChange } from "./access.ts";
import { placeComment } from "./anchor.ts";
import { mustOpenThread } from "./new-thread.ts";
import { CommentTargets, type ReplyRow, type ThreadRow } from "./type.ts";
import { hideQuotes } from "./view.ts";

type Status = "open" | "resolved" | "all";

/**
 * The replies to the threads `threadIds` names, each thread's in the order they were written,
 * asked for in parts so that any number of threads stays under what D1 binds to one statement.
 */
export async function repliesOf(threadIds: readonly string[]): Promise<ReplyRow[]> {
  const parts = await Promise.all(
    chunks(threadIds, IDS_PER_QUERY).map((ids) =>
      db
        .select()
        .from(replies)
        .where(inArray(replies.threadId, ids))
        .orderBy(asc(replies.createdAt))
        .all(),
    ),
  );
  return parts.flat();
}

async function listComments(
  c: Context,
  deck: Deck,
  options: { status: Status; id?: string },
): Promise<CommentRow[]> {
  const version = await currentVersionOf(deck);
  const rows = await db
    .select()
    .from(threads)
    .where(
      options.id
        ? and(eq(threads.deckId, deck.id), eq(threads.id, options.id))
        : eq(threads.deckId, deck.id),
    )
    .orderBy(asc(threads.createdAt), asc(threads.id))
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
  const replyRows = await repliesOf(wanted.map((row) => row.id));
  const renameRows = await renamesOf(deck.id);
  const people = await peopleById(c, [
    ...wanted.map((row) => row.authorId),
    ...replyRows.map((row) => row.authorId),
  ]);
  const url = await talkUrl(c, deck);

  return wanted.map((row) => {
    const targets = readJson(CommentTargets, row.targets);
    const placed = version
      ? placeComment(
          { slug: row.slug, targets, n: row.n, resolved: row.resolvedAt !== null },
          version.slideMap,
          renameRows,
          version.n,
        )
      : { slug: row.slug, status: row.resolvedAt ? ("resolved" as const) : ("open" as const) };
    return {
      number: row.number,
      id: row.id,
      scope: row.scope,
      slug: placed.slug,
      step: row.step,
      status: placed.status,
      text: row.text,
      targets,
      author: authorOf(row, people),
      version: row.n,
      url: `${url}#${row.id}`,
      thread: replyRows
        .filter((reply) => reply.threadId === row.id)
        .map((reply) => ({
          id: reply.id,
          author: authorOf(reply, people),
          text: reply.text,
          createdAt: reply.createdAt,
        })),
      createdAt: row.createdAt,
      resolvedAt: row.resolvedAt,
    };
  });
}

/**
 * A deck's comments as `person`, on `side`, reads them, placed on the current version. A quoted
 * passage is part of the script, so someone the script is hidden from gets each comment without
 * it.
 */
export async function commentsFor(
  c: Context,
  deck: Deck,
  person: Account | null,
  side: GrantSide,
  status: Status,
): Promise<CommentRow[]> {
  const rows = (await listComments(c, deck, { status })).filter((row) => canSeeThread(row, side));
  return canSeeScript(deck, person) ? rows : rows.map(hideQuotes);
}

/** One comment as `person` reads it, after they changed it or replied to it. */
export async function commentFor(
  c: Context,
  deck: Deck,
  person: Account | null,
  side: GrantSide,
  id: string,
): Promise<CommentRow> {
  const [row] = await listComments(c, deck, { status: "all", id });
  if (!row || !canSeeThread(row, side)) {
    throw notFound("comment");
  }
  return canSeeScript(deck, person) ? row : hideQuotes(row);
}

export async function openThread(
  deck: Deck,
  person: Person,
  side: GrantSide,
  comment: NewComment,
): Promise<string> {
  const scope = scopeFor(comment.scope, side);
  // The thread is kept on the version the commenter was reading, which must be the current one,
  // so the renames since are followed when it is shown on a later one.
  const version = mustOpenThread(
    deck,
    await currentVersionOf(deck),
    comment,
    canSeeScript(deck, person),
  );
  const id = newThreadId();
  await db.insert(threads).values({
    id,
    deckId: deck.id,
    number: await takeNumber(deck.id, scope),
    scope,
    n: version.n,
    slug: comment.anchor.slug,
    step: comment.anchor.step,
    targets: JSON.stringify(comment.anchor.targets),
    text: comment.text,
    authorId: person.id,
  });
  return id;
}

/** The next number in the deck's count of threads of `scope`. */
async function takeNumber(deckId: string, scope: ThreadScope): Promise<number> {
  const column = scope === "team" ? decks.nextTeamThread : decks.nextThread;
  const [counter] = await db
    .update(decks)
    .set(
      scope === "team"
        ? { nextTeamThread: sql`${column} + 1` }
        : { nextThread: sql`${column} + 1` },
    )
    .where(eq(decks.id, deckId))
    .returning({ next: column });
  return (counter?.next ?? 2) - 1;
}

/**
 * A thread `person`, holding `role` on `side`, may read, to reply to, resolve or share; any other
 * is as missing as one that is not, so a reader of a public deck the threads are not shared with
 * cannot learn one is there.
 */
export async function visibleThread(
  deck: Deck,
  person: Caller,
  role: GrantRole | null,
  side: GrantSide,
  id: string,
): Promise<ThreadRow> {
  const thread = await db
    .select()
    .from(threads)
    .where(and(eq(threads.deckId, deck.id), eq(threads.id, id)))
    .get();
  if (!thread || !canReadThread(deck, person, role, side, thread)) {
    throw notFound("comment");
  }
  return thread;
}

/**
 * The thread the request's `:comment` names, on the deck its `:id` names, once `person` may make
 * `change` to it: as missing as one that is not to whoever may not read it, refused to whoever
 * reads it but may not change it.
 */
export async function threadToChange(
  c: Context,
  person: Person,
  change: ThreadChange,
): Promise<Standing & { deck: Deck; thread: ThreadRow }> {
  const standing = await requestedDeck(c, person);
  const { deck, role, side } = standing;
  const thread = await visibleThread(deck, person, role, side, c.req.param("comment") ?? "");
  mustResolve(deck, thread, person, role, change);
  return { ...standing, thread };
}

export async function addReply(thread: ThreadRow, person: Person, text: string): Promise<string> {
  const id = newReplyId();
  await db.insert(replies).values({ id, threadId: thread.id, text, authorId: person.id });
  return id;
}

/**
 * Share a team thread with the guests, under the next shared number, so the guests' count of
 * threads has no gap where it was. A shared thread is left as it is: none is ever narrowed.
 */
export async function widenThread(thread: ThreadRow): Promise<void> {
  if (thread.scope === "shared") {
    return;
  }
  // One batch, each statement only while the thread is still the team's, so two requests to
  // share it at once take one number between them.
  const stillTeam = and(eq(threads.id, thread.id), eq(threads.scope, "team"));
  await db.batch([
    db
      .update(decks)
      .set({ nextThread: sql`${decks.nextThread} + 1` })
      .where(
        and(
          eq(decks.id, thread.deckId),
          exists(db.select({ id: threads.id }).from(threads).where(stillTeam)),
        ),
      ),
    db
      .update(threads)
      .set({
        scope: "shared",
        number: sql`(select ${decks.nextThread} - 1 from ${decks} where ${decks.id} = ${thread.deckId})`,
      })
      .where(stillTeam),
  ]);
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
