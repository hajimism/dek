// Public comments in D1. Deleting a comment deletes the replies to it, since a reply answers no one
// without it.

import { publicComments } from "@schema";
import type { Context } from "hono";
import { and, db, eq, or } from "void/db";
import type {
  NewPublicComment,
  PublicComment,
  PublicReply,
} from "../../../../../../src/pub/protocol.ts";
import { ApiError, notFound } from "../../../common/api-error.ts";
import { now } from "../../../common/db.server.ts";
import { newPublicCommentId } from "../../../common/ids.ts";
import { peopleById } from "../../person/store.server.ts";
import type { Person } from "../../person/type.ts";
import { authorOf } from "../store.server.ts";
import { threadPublic } from "./view.ts";

export type PublicCommentRow = typeof publicComments.$inferSelect;

/** A deck's public comments, oldest first, each with its replies. */
export async function publicCommentsOf(c: Context, deckId: string): Promise<PublicComment[]> {
  const rows = await db
    .select()
    .from(publicComments)
    .where(eq(publicComments.deckId, deckId))
    .all();
  const people = await peopleById(
    c,
    rows.map((row) => row.authorId),
  );
  const shown = (row: PublicCommentRow) => ({
    id: row.id,
    author: authorOf(row, people),
    text: row.text,
    createdAt: row.createdAt,
    editedAt: row.editedAt,
  });
  return threadPublic(rows).map((top) => ({ ...shown(top), replies: top.replies.map(shown) }));
}

/** One comment or reply as the list shows it, after it was posted or changed. */
export async function publicCommentFor(
  c: Context,
  deckId: string,
  id: string,
): Promise<PublicReply> {
  const found = (await publicCommentsOf(c, deckId))
    .flatMap((top) => [top, ...top.replies])
    .find((each) => each.id === id);
  if (!found) {
    throw notFound("comment");
  }
  return found;
}

export async function findPublic(deckId: string, id: string): Promise<PublicCommentRow> {
  const row = await db
    .select()
    .from(publicComments)
    .where(and(eq(publicComments.deckId, deckId), eq(publicComments.id, id)))
    .get();
  if (!row) {
    throw notFound("comment");
  }
  return row;
}

/** Post a comment, or a reply to a top-level one on the same deck; answers its ID. */
export async function postPublic(
  deckId: string,
  person: Person,
  body: NewPublicComment,
): Promise<string> {
  if (body.parentId !== undefined) {
    const parent = await findPublic(deckId, body.parentId);
    if (parent.parentId !== null) {
      throw new ApiError(422, "nested_reply", "a reply answers a comment, not another reply");
    }
  }
  const id = newPublicCommentId();
  await db.insert(publicComments).values({
    id,
    deckId,
    parentId: body.parentId ?? null,
    authorId: person.id,
    text: body.text,
  });
  return id;
}

export async function editPublic(row: PublicCommentRow, text: string): Promise<void> {
  await db.update(publicComments).set({ text, editedAt: now }).where(eq(publicComments.id, row.id));
}

export async function deletePublic(row: PublicCommentRow): Promise<void> {
  await db
    .delete(publicComments)
    .where(or(eq(publicComments.id, row.id), eq(publicComments.parentId, row.id)));
}
