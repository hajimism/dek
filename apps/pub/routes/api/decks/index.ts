import { decks } from "@schema";
import { defineHandler } from "void";
import { db, desc, eq } from "void/db";
import { CreateDeckRequest } from "../../../../../src/pub/protocol.ts";
import { requirePerson } from "../../../src/model/person/feature/auth/actor.server.ts";
import { deckBySlug, deckById, deckStatus, writeAccess } from "../../../src/model/deck/store.server.ts";
import { ApiError, api, jsonBody } from "../../../src/common/http.server.ts";
import { newDeckId } from "../../../src/common/ids.ts";

/** Create a deck, private, before its first version is uploaded. */
export const POST = defineHandler((c) =>
  api(async () => {
    const person = await requirePerson(c);
    const body = await jsonBody(c, CreateDeckRequest);
    if (await deckBySlug(person.id, body.slug)) {
      throw new ApiError(
        409,
        "slug_taken",
        `you already have a deck at /@${person.handle}/${body.slug}`,
        "put that deck's ID in pub: in script.md, or rename the deck folder",
      );
    }
    const id = newDeckId();
    await db.insert(decks).values({ id, ownerId: person.id, slug: body.slug, title: body.title });
    const deck = await deckById(id);
    if (!deck) {
      throw new Error("the deck just made is not there");
    }
    await writeAccess(deck.id);
    return Response.json(await deckStatus(c, deck), { status: 201 });
  }, c.req.raw),
);

/** The caller's own decks, newest first. */
export const GET = defineHandler((c) =>
  api(async () => {
    const person = await requirePerson(c);
    const rows = await db.select().from(decks).where(eq(decks.ownerId, person.id)).orderBy(desc(decks.updatedAt)).all();
    return { decks: await Promise.all(rows.map((row) => deckStatus(c, row))) };
  }, c.req.raw),
);
