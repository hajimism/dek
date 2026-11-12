import { grants } from "@schema";
import { defineHandler } from "void";
import { asc, db, eq } from "void/db";
import { NewGrant } from "../../../../../../../src/pub/protocol.ts";
import { isHandle } from "../../../../../src/lib/handle.ts";
import { newGrantId } from "../../../../../src/lib/ids.ts";
import { requirePerson } from "../../../../../src/server/actor.ts";
import { ownedDeck } from "../../../../../src/server/decks.ts";
import { ApiError, api, jsonBody } from "../../../../../src/server/http.ts";
import { userByHandle, usersById } from "../../../../../src/server/users.ts";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export const GET = defineHandler((c) =>
  api(async () => {
    const person = await requirePerson(c);
    const deck = await ownedDeck(c.req.param("id") ?? "", person);
    const rows = await db.select().from(grants).where(eq(grants.deckId, deck.id)).orderBy(asc(grants.createdAt)).all();
    const people = await usersById(c, rows.flatMap((row) => (row.userId ? [row.userId] : [])));
    return {
      grants: rows.map((row) => ({
        id: row.id,
        who: row.userId ? (people.get(row.userId)?.handle ?? row.userId) : (row.email ?? ""),
        role: row.role,
        createdAt: row.createdAt,
      })),
    };
  }),
);

/** Share the deck with one person, by handle, or by an email address no account has yet. */
export const POST = defineHandler((c) =>
  api(async () => {
    const person = await requirePerson(c);
    const deck = await ownedDeck(c.req.param("id") ?? "", person);
    const { who, role } = await jsonBody(c, NewGrant);
    const name = who.replace(/^@/, "").toLowerCase();
    let target: { userId: string | null; email: string | null };
    if (EMAIL_RE.test(name)) {
      target = { userId: null, email: name };
    } else if (isHandle(name)) {
      const user = await userByHandle(c, name);
      if (!user) {
        throw new ApiError(404, "no_such_person", `no one on dek.pub is @${name}`, "share by email address instead");
      }
      if (user.id === deck.ownerId) {
        throw new ApiError(422, "owner", "the deck is already yours");
      }
      target = { userId: user.id, email: null };
    } else {
      throw new ApiError(422, "invalid", "name a handle or an email address");
    }
    const id = newGrantId();
    await db
      .insert(grants)
      .values({ id, deckId: deck.id, ...target, role })
      .onConflictDoUpdate({ target: target.userId ? [grants.deckId, grants.userId] : [grants.deckId, grants.email], set: { role } });
    return Response.json({ who: name, role }, { status: 201 });
  }),
);
