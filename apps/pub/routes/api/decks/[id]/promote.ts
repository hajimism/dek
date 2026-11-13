import { decks } from "@schema";
import { defineHandler } from "void";
import { db, eq, sql } from "void/db";
import { PromoteRequest } from "../../../../../../src/pub/protocol.ts";
import { requirePerson } from "../../../../src/model/person/feature/auth/actor.server.ts";
import { deckById, deckStatus, ownedDeck, versionRow, writeAccess } from "../../../../src/model/deck/store.server.ts";
import { api, jsonBody, notFound } from "../../../../src/common/http.server.ts";

/** Point readers at another version: a rollback, or showing one uploaded with --no-promote. */
export const POST = defineHandler((c) =>
  api(async () => {
    const person = await requirePerson(c);
    const deck = await ownedDeck(c.req.param("id") ?? "", person);
    const { n } = await jsonBody(c, PromoteRequest);
    if (!(await versionRow(deck.id, n))) {
      throw notFound("version");
    }
    await db
      .update(decks)
      .set({ currentVersion: n, updatedAt: sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))` })
      .where(eq(decks.id, deck.id));
    const updated = await deckById(deck.id);
    if (!updated) {
      throw new Error("the deck just updated is not there");
    }
    await writeAccess(updated.id);
    return deckStatus(c, updated);
  }, c.req.raw),
);
