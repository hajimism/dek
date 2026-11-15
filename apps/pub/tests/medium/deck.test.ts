// The deck's stores against D1 and R2: what the rules in tests/unit/deck.test.ts decide, wired to
// the rows and files they read and write.

import { grants, likes, mutes, publicComments, renames, replies, threads, versions } from "@schema";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db, eq, sql } from "void/db";
import { DECK_ROWS } from "../../src/model/deck/deletion.ts";
import {
  accessKey,
  deckPrefix,
  versionKey,
  versionsPrefix,
} from "../../src/model/deck/serving/origin.ts";
import type { DeckAccess } from "../../src/model/deck/serving/type.ts";
import {
  deckById,
  deleteDeck,
  updateDeck,
  visibleDeck,
} from "../../src/model/deck/store.server.ts";
import { deleteVersionsBelow } from "../../src/model/deck/version/store.server.ts";
import { env } from "./env.ts";
import { owner, publishedDeck, stranger, versionRow } from "./fixtures.ts";

async function accessFile(deckId: string): Promise<DeckAccess | null> {
  return (await (await env.STORAGE.get(accessKey(deckId)))?.json<DeckAccess>()) ?? null;
}

/** Fail every write to R2 after the first `passing`, as an outage halfway through would. */
function failWritesAfter(passing: number) {
  const put = env.STORAGE.put.bind(env.STORAGE);
  let calls = 0;
  return vi.spyOn(env.STORAGE, "put").mockImplementation((...args: Parameters<R2Bucket["put"]>) => {
    calls += 1;
    return calls > passing ? Promise.reject(new Error("R2 is down")) : put(...args);
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the access file", () => {
  it("follows the row as a deck is made public, then private", async () => {
    const deck = await publishedDeck();
    expect(await accessFile(deck.id)).toMatchObject({ visibility: "team", current: 1 });
    await updateDeck(deck, { visibility: "public" });
    expect(await accessFile(deck.id)).toMatchObject({ visibility: "public" });
    await updateDeck(deck, { visibility: "private" });
    expect(await accessFile(deck.id)).toMatchObject({ visibility: "private" });
  });

  it("stays closed when the write after the row fails on a change that closes", async () => {
    const deck = await publishedDeck({ visibility: "public", scriptPublic: true });
    failWritesAfter(1);
    await expect(updateDeck(deck, { visibility: "private" })).rejects.toThrow("R2 is down");
    expect((await deckById(deck.id))?.visibility).toBe("private");
    expect(await accessFile(deck.id)).toMatchObject({ visibility: "private", scriptPublic: true });
  });

  it("changes nothing when the first write fails on a change that closes", async () => {
    const deck = await publishedDeck({ visibility: "public" });
    failWritesAfter(0);
    await expect(updateDeck(deck, { visibility: "private" })).rejects.toThrow("R2 is down");
    expect((await deckById(deck.id))?.visibility).toBe("public");
    expect(await accessFile(deck.id)).toMatchObject({ visibility: "public" });
  });

  it("stays closed when the write fails on a change that opens", async () => {
    const deck = await publishedDeck({ visibility: "private" });
    failWritesAfter(0);
    await expect(updateDeck(deck, { visibility: "public", embed: true })).rejects.toThrow();
    expect((await deckById(deck.id))?.visibility).toBe("public");
    expect(await accessFile(deck.id)).toMatchObject({ visibility: "private", embed: false });
  });

  it("is not written for a change that touches none of its columns", async () => {
    const deck = await publishedDeck();
    const put = failWritesAfter(0);
    await updateDeck(deck, { comments: "off" });
    expect(put).not.toHaveBeenCalled();
  });
});

describe("who a deck opens to", () => {
  it("opens a team deck to its owner and is a 404 to anyone else", async () => {
    const deck = await publishedDeck();
    await expect(visibleDeck(deck.id, owner, null)).resolves.toMatchObject({
      opens: true,
    });
    await expect(visibleDeck(deck.id, stranger, null)).rejects.toMatchObject({ status: 404 });
    await expect(visibleDeck(deck.id, null, null)).rejects.toMatchObject({ status: 404 });
  });

  it("opens a deck to an address it is shared with before the grant is claimed", async () => {
    const deck = await publishedDeck({ visibility: "private" });
    await db.insert(grants).values({
      id: "g1",
      deckId: deck.id,
      email: stranger.email,
      role: "view",
      side: "guest",
    });
    await expect(visibleDeck(deck.id, stranger, null)).resolves.toMatchObject({ role: "view" });
    await expect(
      visibleDeck(deck.id, { ...stranger, emailVerified: false }, null),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("opens a link deck to whoever holds its key, and to no one by a wrong one", async () => {
    const deck = await publishedDeck({ visibility: "link", linkKey: "0123456789abcdefghijklmnop" });
    await expect(visibleDeck(deck.id, null, "0123456789abcdefghijklmnop")).resolves.toBeTruthy();
    await expect(visibleDeck(deck.id, null, "0123456789abcdefghijklmnoq")).rejects.toMatchObject({
      status: 404,
    });
    await expect(visibleDeck(deck.id, null, null)).rejects.toMatchObject({ status: 404 });
  });

  it("is a 404 for a deck that is not there", async () => {
    await expect(visibleDeck("d_missing000", stranger, null)).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe("deleting a deck", () => {
  /** A row in every table DECK_ROWS names, for `deckId`. */
  async function fill(deckId: string): Promise<void> {
    const thread = `t_${deckId}`;
    await db.insert(threads).values({
      id: thread,
      deckId,
      number: 1,
      n: 1,
      slug: "intro",
      step: "0",
      targets: "[]",
      text: "Nice.",
      authorId: stranger.id,
    });
    await db
      .insert(replies)
      .values({ id: `r_${deckId}`, threadId: thread, text: "Thanks.", authorId: owner.id });
    await db
      .insert(publicComments)
      .values({ id: `p_${deckId}`, deckId, authorId: stranger.id, text: "Hi." });
    await db.insert(likes).values({ deckId, userId: stranger.id });
    await db.insert(mutes).values({ deckId, userId: stranger.id });
    await db
      .insert(grants)
      .values({ id: `g_${deckId}`, deckId, userId: stranger.id, role: "view" });
    await db
      .insert(renames)
      .values({ deckId, fromSlug: "a", toSlug: "intro", at: "2026-11-01", n: 1 });
    await env.STORAGE.put(versionKey(deckId, 1, "full.html"), "<p>full</p>");
  }

  async function rowsOf(deckId: string): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    for (const rows of DECK_ROWS) {
      const where =
        "through" in rows
          ? sql`${sql.identifier(rows.column)} in (select id from ${sql.identifier(rows.through)} where deck_id = ${deckId})`
          : sql`${sql.identifier(rows.column)} = ${deckId}`;
      const found = await db.get<{ n: number }>(
        sql`select count(*) as n from ${sql.identifier(rows.table)} where ${where}`,
      );
      counts[rows.table] = found?.n ?? 0;
    }
    return counts;
  }

  it("takes every row and every file of the deck, and nothing of another", async () => {
    const gone = await publishedDeck({ visibility: "public" });
    const kept = await publishedDeck({ visibility: "public" });
    await fill(gone.id);
    await fill(kept.id);
    expect(Object.values(await rowsOf(gone.id)).every((n) => n > 0)).toBe(true);

    await deleteDeck(gone);

    expect(Object.values(await rowsOf(gone.id)).every((n) => n === 0)).toBe(true);
    expect((await env.STORAGE.list({ prefix: deckPrefix(gone.id) })).objects).toEqual([]);
    expect(Object.values(await rowsOf(kept.id)).every((n) => n > 0)).toBe(true);
    expect(await accessFile(kept.id)).toMatchObject({ visibility: "public" });
  });
});

describe("deleting older versions", () => {
  it("takes the files and rows below n, and leaves n and above", async () => {
    const deck = await publishedDeck();
    for (const n of [2, 3, 4]) {
      await db.insert(versions).values(versionRow(deck.id, n));
    }
    for (const n of [1, 2, 3, 4, 12]) {
      await env.STORAGE.put(versionKey(deck.id, n, "full.html"), `<p>${n}</p>`);
    }

    await deleteVersionsBelow(deck.id, 3);

    const left = (await env.STORAGE.list({ prefix: versionsPrefix(deck.id) })).objects;
    expect(left.map((object: R2Object) => object.key).sort()).toEqual(
      [3, 4, 12].map((n) => versionKey(deck.id, n, "full.html")).sort(),
    );
    const rows = await db
      .select({ n: versions.n })
      .from(versions)
      .where(eq(versions.deckId, deck.id));
    expect(rows.map((row) => row.n).sort()).toEqual([3, 4]);
  });
});
