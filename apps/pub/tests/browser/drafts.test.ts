// What a person types and has not sent is still there after a reload: each composer is rendered,
// typed into, taken away as a reload takes it, and rendered again.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { CommentRow, PublicComment } from "../../../../src/pub/protocol.ts";
import type { Draft } from "../../src/model/comment/type.ts";
import CommentCard from "../../src/model/comment/ui/comment-card.svelte";
import CommentsPanel from "../../src/model/comment/ui/comments-panel.svelte";
import Composer from "../../src/model/comment/ui/composer.svelte";
import PublicComments from "../../src/model/deck/public-comment/ui/public-comments.svelte";
import { NOW, renderPage } from "./setup.ts";

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

const quoted = (quote: string): Draft => ({
  anchor: { slug: "intro", step: "0", targets: [{ kind: "quote", quote, prefix: "", suffix: "" }] },
  slideNumber: 1,
});

const panel = {
  comments: [],
  slideNumbers: new Map([["intro", 1]]),
  canComment: true,
  deckId: "d_1",
  onselect: () => {},
  onanchor: () => {},
  onresolve: async () => {},
  onreopen: async () => {},
  onwiden: async () => {},
  onreply: async () => true,
  oncreate: async () => true,
  oncanceldraft: () => {},
  onretry: () => {},
  oncopylink: () => {},
};

describe("a new thread's draft", () => {
  it("comes back on the same passage after a reload, and not on another", async () => {
    let rendered = await renderPage(CommentsPanel, { ...panel, draft: quoted("three times") });
    await page.getByRole("textbox").fill("Needs a source");
    await rendered.unmount();

    rendered = await renderPage(CommentsPanel, { ...panel, draft: quoted("three times") });
    await expect.element(page.getByRole("textbox")).toHaveValue("Needs a source");
    await rendered.rerender({ ...panel, draft: quoted("faster") });
    await expect.element(page.getByRole("textbox")).toHaveValue("");
    await rendered.rerender({ ...panel, draft: quoted("three times") });
    await expect.element(page.getByRole("textbox")).toHaveValue("Needs a source");
    await rendered.unmount();

    await renderPage(CommentsPanel, { ...panel, deckId: "d_2", draft: quoted("three times") });
    await expect.element(page.getByRole("textbox")).toHaveValue("");
  });

  it("goes once it is sent, or cancelled", async () => {
    let rendered = await renderPage(CommentsPanel, { ...panel, draft: quoted("three times") });
    await page.getByRole("textbox").fill("Needs a source");
    await page.getByRole("button", { name: "Comment" }).click();
    await rendered.unmount();
    rendered = await renderPage(CommentsPanel, { ...panel, draft: quoted("three times") });
    await expect.element(page.getByRole("textbox")).toHaveValue("");

    await page.getByRole("textbox").fill("Never mind");
    await page.getByRole("button", { name: "Cancel" }).click();
    await rendered.unmount();
    await renderPage(CommentsPanel, { ...panel, draft: quoted("three times") });
    await expect.element(page.getByRole("textbox")).toHaveValue("");
    expect(localStorage.length).toBe(0);
  });
});

function thread(id: string): CommentRow {
  return {
    number: 1,
    id,
    scope: "shared",
    slug: "intro",
    step: "0",
    status: "open",
    text: "The number needs a source.",
    targets: [],
    author: { name: "Sato Yuki", handle: "sato" },
    version: 1,
    url: `http://localhost/@demo/talk#${id}`,
    thread: [],
    createdAt: new Date(NOW).toISOString(),
    resolvedAt: null,
  };
}

const card = (id: string, onreply = async () => true) => ({
  comment: thread(id),
  slideNumber: 1,
  now: NOW,
  canReply: true,
  deckId: "d_1",
  onreply,
});

describe("a reply's draft", () => {
  it("comes back when its thread's reply opens again, kept while sending fails", async () => {
    const onreply = vi.fn(async () => false);
    let rendered = await renderPage(CommentCard, card("c_1", onreply));
    await page.getByRole("button", { name: "Reply" }).click();
    await page.getByRole("textbox").fill("Here it is");
    await page.getByRole("button", { name: "Reply" }).click();
    expect(onreply).toHaveBeenCalledWith({ text: "Here it is" });
    await rendered.unmount();

    rendered = await renderPage(CommentCard, card("c_2"));
    await page.getByRole("button", { name: "Reply" }).click();
    await expect.element(page.getByRole("textbox")).toHaveValue("");
    await rendered.unmount();

    rendered = await renderPage(CommentCard, card("c_1"));
    await page.getByRole("button", { name: "Reply" }).click();
    await expect.element(page.getByRole("textbox")).toHaveValue("Here it is");
    await page.getByRole("button", { name: "Reply" }).click();
    await rendered.unmount();

    await renderPage(CommentCard, card("c_1"));
    await page.getByRole("button", { name: "Reply" }).click();
    await expect.element(page.getByRole("textbox")).toHaveValue("");
    expect(localStorage.length).toBe(0);
  });

  it("goes when the reply is cancelled", async () => {
    const rendered = await renderPage(CommentCard, card("c_1"));
    await page.getByRole("button", { name: "Reply" }).click();
    await page.getByRole("textbox").fill("On second thought");
    await page.getByRole("button", { name: "Cancel" }).click();
    await rendered.unmount();
    expect(localStorage.length).toBe(0);
  });
});

const publicComments: PublicComment[] = [
  {
    id: "p_1",
    author: { name: "demo", handle: "demo" },
    text: "Great talk",
    createdAt: "2026-11-13T11:00:00.000Z",
    editedAt: null,
    replies: [],
  },
];
const below = {
  comments: publicComments,
  canPost: true,
  signinHref: "/signin",
  deckId: "d_1",
  onpost: async () => true,
  onedit: async () => true,
  ondelete: async () => {},
};

describe("a public comment's draft", () => {
  it("comes back below the talk, and goes once it is sent", async () => {
    const onpost = vi.fn(async () => false);
    let rendered = await renderPage(PublicComments, { ...below, onpost });
    await page.getByPlaceholder("Add a comment…").fill("Thanks!");
    await page.getByRole("button", { name: "Comment", exact: true }).click();
    expect(onpost).toHaveBeenCalledOnce();
    await rendered.unmount();

    rendered = await renderPage(PublicComments, below);
    await expect.element(page.getByPlaceholder("Add a comment…")).toHaveValue("Thanks!");
    await page.getByRole("button", { name: "Comment", exact: true }).click();
    await rendered.unmount();
    await renderPage(PublicComments, below);
    await expect.element(page.getByPlaceholder("Add a comment…")).toHaveValue("");
  });

  it("keeps a reply apart from the comment below the talk", async () => {
    let rendered = await renderPage(PublicComments, below);
    await page.getByRole("button", { name: "Reply" }).click();
    await page.getByPlaceholder("Reply…").fill("Me too");
    await rendered.unmount();

    rendered = await renderPage(PublicComments, below);
    await expect.element(page.getByPlaceholder("Add a comment…")).toHaveValue("");
    await page.getByRole("button", { name: "Reply" }).click();
    await expect.element(page.getByPlaceholder("Reply…")).toHaveValue("Me too");
    await userEvent.keyboard("{Control>}{Enter}{/Control}");
    await rendered.unmount();
    expect(localStorage.length).toBe(0);
  });

  it("keeps a change to one's comment until it is saved or cancelled", async () => {
    let rendered = await renderPage(PublicComments, below);
    await page.getByRole("button", { name: "Edit" }).click();
    await page.getByRole("textbox", { name: "Edit" }).fill("Great talk, thanks");
    await rendered.unmount();

    rendered = await renderPage(PublicComments, below);
    await page.getByRole("button", { name: "Edit" }).click();
    await expect
      .element(page.getByRole("textbox", { name: "Edit" }))
      .toHaveValue("Great talk, thanks");
    await page.getByRole("button", { name: "Cancel" }).click();
    await rendered.unmount();

    rendered = await renderPage(PublicComments, below);
    await page.getByRole("button", { name: "Edit" }).click();
    await expect.element(page.getByRole("textbox", { name: "Edit" })).toHaveValue("Great talk");
    await page.getByRole("textbox", { name: "Edit" }).fill("Great talk!");
    await page.getByRole("button", { name: "Save" }).click();
    await rendered.unmount();
    expect(localStorage.length).toBe(0);
  });
});

describe("a composer where storage is blocked", () => {
  it("works as it would with nothing kept", async () => {
    for (const method of ["getItem", "setItem", "removeItem"] as const) {
      vi.spyOn(Storage.prototype, method).mockImplementation(() => {
        throw new DOMException("blocked", "SecurityError");
      });
    }
    const onsubmit = vi.fn(async () => true);
    await renderPage(Composer, { draftKey: "dek.pub:draft:d_1:public", onsubmit });
    await page.getByRole("textbox").fill("Still works");
    await page.getByRole("button", { name: "Comment" }).click();
    expect(onsubmit).toHaveBeenLastCalledWith({ text: "Still works" });
    await expect.element(page.getByRole("textbox")).toHaveValue("");
  });
});
