// Who may sign up and whose grants an account takes, against D1: the gate on new accounts reads
// these rows, and only a real D1 shows the queries right.

import { grants } from "@schema";
import { describe, expect, it } from "vitest";
import { db, eq } from "void/db";
import { claimGrants, hasWaitingGrant } from "../../src/model/deck/grant/store.server.ts";
import { deleteDeck } from "../../src/model/deck/store.server.ts";
import {
  addSignUpInvites,
  claimSignUpInvites,
  hasOpenSignUpInvite,
  removeSignUpInvite,
  signUpInvitesAll,
} from "../../src/model/person/sign-up-invite.server.ts";
import { publishedDeck, stranger } from "./fixtures.ts";

describe("sign-up invites", () => {
  it("lets in an entry until an account claims it, and never again after", async () => {
    expect(await addSignUpInvites(["sato@example.com", "@octocat"], "u1")).toEqual([
      "sato@example.com",
      "@octocat",
    ]);
    expect(await hasOpenSignUpInvite(["sato@example.com"])).toBe(true);
    expect(await hasOpenSignUpInvite(["@octocat", "nobody@example.com"])).toBe(true);
    expect(await hasOpenSignUpInvite(["nobody@example.com"])).toBe(false);

    await claimSignUpInvites("u2", ["sato@example.com"]);
    expect(await hasOpenSignUpInvite(["sato@example.com"])).toBe(false);
    expect(await hasOpenSignUpInvite(["@octocat"])).toBe(true);
  });

  it("keeps an entry added twice as it was, and adds as many as are given at once", async () => {
    await addSignUpInvites(["sato@example.com"], "u1");
    await claimSignUpInvites("u2", ["sato@example.com"]);
    const many = Array.from({ length: 120 }, (_, i) => `p${i}@example.com`);
    const added = await addSignUpInvites(["sato@example.com", ...many], "u3");
    expect(added).toEqual(many);
    const kept = (await signUpInvitesAll()).find((row) => row.entry === "sato@example.com");
    expect(kept).toMatchObject({ addedBy: "u1", claimedBy: "u2" });
  });

  it("removes only an entry no account has claimed", async () => {
    await addSignUpInvites(["sato@example.com", "ito@example.com"], "u1");
    await claimSignUpInvites("u2", ["sato@example.com"]);
    const rows = await signUpInvitesAll();
    const id = (entry: string) => rows.find((row) => row.entry === entry)?.id ?? "";
    expect(await removeSignUpInvite(id("ito@example.com"))).toBe("removed");
    expect(await removeSignUpInvite(id("sato@example.com"))).toBe("claimed");
    expect(await removeSignUpInvite("missing")).toBe("missing");
  });
});

describe("grants waiting on an address", () => {
  it("let the address sign up only while their deck is there", async () => {
    const deck = await publishedDeck();
    await db
      .insert(grants)
      .values({ id: "g1", deckId: deck.id, email: "sato@example.com", role: "view" });
    expect(await hasWaitingGrant("Sato@Example.com")).toBe(true);
    await deleteDeck(deck);
    expect(await hasWaitingGrant("sato@example.com")).toBe(false);
  });

  it("are tied to the account that verifies the address, beside a grant it already holds", async () => {
    const shared = await publishedDeck();
    const both = await publishedDeck();
    await db.insert(grants).values([
      { id: "g1", deckId: shared.id, email: stranger.email, role: "view" },
      { id: "g2", deckId: both.id, email: stranger.email, role: "comment" },
      { id: "g3", deckId: both.id, userId: stranger.id, role: "view" },
    ]);

    await claimGrants({ ...stranger, emailVerified: false });
    expect((await db.select().from(grants).where(eq(grants.id, "g1")).get())?.userId).toBeNull();

    await claimGrants(stranger);
    const row = async (id: string) => db.select().from(grants).where(eq(grants.id, id)).get();
    expect((await row("g1"))?.userId).toBe(stranger.id);
    expect((await row("g2"))?.userId).toBeNull();
    expect((await row("g3"))?.userId).toBe(stranger.id);
    expect(await hasWaitingGrant(stranger.email)).toBe(true);
  });
});
