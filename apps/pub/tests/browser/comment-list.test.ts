import { afterEach, describe, expect, it, vi } from "vitest";
import type { CommentRow, NewComment } from "../../../../src/pub/protocol.ts";
import { CommentList } from "../../src/model/comment/client.svelte.ts";

const author = { name: "Hajime", handle: "demo" };

function row(overrides: Partial<CommentRow> = {}): CommentRow {
  return {
    number: 1,
    id: "c_1",
    scope: "shared",
    slug: "intro",
    step: "0",
    status: "open",
    text: "First",
    targets: [],
    author,
    version: 1,
    url: "http://localhost/@demo/talk#c_1",
    thread: [],
    createdAt: "2026-11-13T12:00:00.000Z",
    resolvedAt: null,
    ...overrides,
  };
}

const body: NewComment = {
  anchor: { slug: "intro", step: "0", targets: [] },
  text: "Hi",
  version: 1,
};

/** Answer each fetch in turn: a row as JSON, or `null` to fail as the network would. */
function answers(...replies: Array<unknown | null>) {
  const fetch = vi.fn(async () => {
    const reply = replies.shift();
    if (reply === null) {
      throw new TypeError("offline");
    }
    return new Response(JSON.stringify(reply), { status: 200 });
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CommentList", () => {
  it("shows a new comment at once, then as the server made it", async () => {
    const fetch = answers(row({ id: "c_2", number: 2, text: "Hi" }));
    const list = new CommentList("d_x", [row()], () => {});
    const sent = list.create(body, author);
    expect(list.rows.map((each) => [each.id.startsWith("tmp_"), each.pending])).toEqual([
      [false, undefined],
      [true, true],
    ]);
    expect((await sent)?.id).toBe("c_2");
    expect(list.rows.map((each) => each.id)).toEqual(["c_1", "c_2"]);
    expect(list.rows[1]?.pending).toBeUndefined();
    expect(fetch).toHaveBeenCalledWith(
      "/api/decks/d_x/comments",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("guesses a new thread's number within its scope", async () => {
    answers(null);
    const list = new CommentList(
      "d_x",
      [row({ number: 4 }), row({ id: "c_t", scope: "team", number: 1 })],
      () => {},
    );
    await list.create({ ...body, scope: "team" }, author);
    expect(list.rows[2]).toMatchObject({ scope: "team", number: 2 });
  });

  it("shares a team thread with the client and shows it as the server answers", async () => {
    const fetch = answers(row({ id: "c_t", scope: "shared", number: 5 }));
    const list = new CommentList("d_x", [row({ id: "c_t", scope: "team", number: 1 })], () => {});
    expect(await list.widen(list.rows[0] as NonNullable<(typeof list.rows)[0]>)).toBe(true);
    expect(list.rows[0]).toMatchObject({ scope: "shared", number: 5 });
    expect(fetch).toHaveBeenCalledWith(
      "/api/decks/d_x/comments/c_t/widen",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("keeps a comment that did not get through, marked, and sends it again", async () => {
    answers(null, row({ id: "c_2", number: 2 }));
    const failed = vi.fn();
    const list = new CommentList("d_x", [], failed);
    expect(await list.create(body, author)).toBeNull();
    expect(failed).toHaveBeenCalledOnce();
    const card = list.rows[0];
    expect(card).toMatchObject({ pending: false, failed: true });
    expect((await list.retry(card as NonNullable<typeof card>))?.id).toBe("c_2");
    expect(list.rows.map((each) => each.id)).toEqual(["c_2"]);
  });

  it("adds a reply to the end of its thread", async () => {
    const reply = { id: "r_1", author, text: "Yes", createdAt: "2026-11-13T12:01:00.000Z" };
    answers(reply);
    const list = new CommentList("d_x", [row()], () => {});
    expect(await list.reply(row(), { text: "Yes" })).toBe(true);
    expect(list.rows[0]?.thread).toEqual([reply]);
  });

  it("takes the server's row after a resolve, and says when it fails", async () => {
    const fetch = answers(
      row({ status: "resolved", resolvedAt: "2026-11-13T12:02:00.000Z" }),
      null,
    );
    const failed = vi.fn();
    const list = new CommentList("d_x", [row()], failed);
    await list.setResolved(row(), true);
    expect(list.rows[0]?.status).toBe("resolved");
    expect(fetch).toHaveBeenCalledWith("/api/decks/d_x/comments/c_1/resolve", {
      method: "POST",
      credentials: "same-origin",
      headers: {},
      signal: expect.anything(),
    });
    await list.setResolved(row(), false);
    expect(failed).toHaveBeenCalledOnce();
    expect(list.rows[0]?.status).toBe("resolved");
  });
});
