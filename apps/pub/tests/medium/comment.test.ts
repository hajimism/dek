// The comment store against D1: the counters a thread takes its number from, and the lists it
// asks for in parts, which only a real D1 shows right or wrong.

import { mutes, threads } from "@schema";
import { describe, expect, it } from "vitest";
import { db, eq } from "void/db";
import { mutedAmong } from "../../src/model/comment/mute.server.ts";
import { openThread, widenThread } from "../../src/model/comment/store.server.ts";
import { owner, publishedDeck } from "./fixtures.ts";

const comment = (scope: "team" | "shared") => ({
  anchor: { slug: "intro", step: "0", targets: [] },
  text: "Nice.",
  scope,
});

async function numbers(deckId: string, scope: "team" | "shared"): Promise<number[]> {
  const rows = await db
    .select({ number: threads.number, scope: threads.scope })
    .from(threads)
    .where(eq(threads.deckId, deckId));
  return rows
    .filter((row) => row.scope === scope)
    .map((row) => row.number)
    .sort((a, b) => a - b);
}

describe("thread numbers", () => {
  it("gives threads opened at once a number each, with no gap, one count for each scope", async () => {
    const deck = await publishedDeck();
    await Promise.all([
      ...Array.from({ length: 5 }, () => openThread(deck, owner, "team", comment("team"))),
      ...Array.from({ length: 3 }, () => openThread(deck, owner, "team", comment("shared"))),
    ]);
    expect(await numbers(deck.id, "team")).toEqual([1, 2, 3, 4, 5]);
    expect(await numbers(deck.id, "shared")).toEqual([1, 2, 3]);
  });

  it("gives a team thread shared twice at once the next shared number, once", async () => {
    const deck = await publishedDeck();
    await openThread(deck, owner, "team", comment("shared"));
    const id = await openThread(deck, owner, "team", comment("team"));
    const thread = await db.select().from(threads).where(eq(threads.id, id)).get();
    if (!thread) {
      throw new Error("the thread just opened is not there");
    }
    await Promise.all([widenThread(thread), widenThread(thread)]);
    expect(await numbers(deck.id, "shared")).toEqual([1, 2]);
    await openThread(deck, owner, "team", comment("shared"));
    expect(await numbers(deck.id, "shared")).toEqual([1, 2, 3]);
  });
});

describe("mutes", () => {
  it("finds who muted a deck among more people than D1 binds to one statement", async () => {
    const deck = await publishedDeck();
    const people = Array.from({ length: 250 }, (_, i) => `u${i}`);
    const muted = people.filter((_, i) => i % 7 === 0);
    for (const userId of muted) {
      await db.insert(mutes).values({ userId, deckId: deck.id });
    }
    expect([...(await mutedAmong(deck.id, people))].sort()).toEqual([...muted].sort());
  });
});
