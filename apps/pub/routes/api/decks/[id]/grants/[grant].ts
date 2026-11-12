import { grants } from "@schema";
import { defineHandler } from "void";
import { and, db, eq } from "void/db";
import { requirePerson } from "../../../../../src/server/actor.ts";
import { ownedDeck } from "../../../../../src/server/decks.ts";
import { api } from "../../../../../src/server/http.ts";

export const DELETE = defineHandler((c) =>
  api(async () => {
    const person = await requirePerson(c);
    const deck = await ownedDeck(c.req.param("id") ?? "", person);
    await db.delete(grants).where(and(eq(grants.deckId, deck.id), eq(grants.id, c.req.param("grant") ?? "")));
    return { removed: true };
  }, c.req.raw),
);
