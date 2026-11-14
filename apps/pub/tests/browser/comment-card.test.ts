import { describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { CommentRow } from "../../../../src/pub/protocol.ts";
import CommentCard from "../../src/model/comment/ui/comment-card.svelte";
import { NOW, renderPage } from "./setup.ts";

function row(overrides: Partial<CommentRow> = {}): CommentRow {
  return {
    number: 3,
    id: "c_abc",
    scope: "shared",
    slug: "intro",
    step: "0",
    status: "open",
    text: "The number needs a source.",
    targets: [{ kind: "quote", quote: "three times faster", prefix: "it got ", suffix: "." }],
    author: { name: "Sato Yuki", handle: "sato" },
    version: 2,
    url: "http://localhost/@demo/talk#c_abc",
    thread: [],
    createdAt: new Date(NOW - 3 * 86_400_000).toISOString(),
    resolvedAt: null,
    ...overrides,
  };
}

describe("CommentCard", () => {
  it("shows an open comment with its quote, author, time and actions", async () => {
    const onresolve = vi.fn();
    await renderPage(CommentCard, {
      comment: row(),
      slideNumber: 4,
      now: NOW,
      canResolve: true,
      canReply: true,
      onresolve,
    });
    await expect.element(page.getByText("three times faster")).toBeVisible();
    await expect.element(page.getByText("Sato Yuki")).toBeVisible();
    await expect.element(page.getByText("3 days ago")).toBeVisible();
    await page.getByRole("button", { name: "Resolve" }).click();
    expect(onresolve).toHaveBeenCalledOnce();
    await expect.element(page.getByRole("button", { name: "Reply" })).toBeVisible();
  });

  it("hides Resolve and Reply from someone who may do neither", async () => {
    await renderPage(CommentCard, { comment: row(), slideNumber: 4, now: NOW });
    await expect.element(page.getByRole("button", { name: "Resolve" })).not.toBeInTheDocument();
    await expect.element(page.getByRole("button", { name: "Reply" })).not.toBeInTheDocument();
  });

  it("marks a team thread, numbers it with a T, and offers to show it to the client", async () => {
    const onwiden = vi.fn();
    await renderPage(CommentCard, {
      comment: row({ scope: "team" }),
      slideNumber: 4,
      now: NOW,
      canWiden: true,
      onwiden,
    });
    await expect.element(page.getByText("Team only")).toBeVisible();
    await expect.element(page.getByText("#T3")).toBeVisible();
    await page.getByRole("button", { name: "Show to client" }).click();
    expect(onwiden).toHaveBeenCalledOnce();
  });

  it("offers nothing to widen on a shared thread", async () => {
    await renderPage(CommentCard, { comment: row(), slideNumber: 4, now: NOW, canWiden: true });
    await expect.element(page.getByText("#3")).toBeVisible();
    await expect.element(page.getByText("Team only")).not.toBeInTheDocument();
    await expect
      .element(page.getByRole("button", { name: "Show to client" }))
      .not.toBeInTheDocument();
  });

  it("marks a comment whose slide moved", async () => {
    await renderPage(CommentCard, { comment: row({ status: "moved" }), slideNumber: 4, now: NOW });
    await expect.element(page.getByText("Moved", { exact: true })).toBeVisible();
    await expect.element(page.getByText("On v2")).toBeVisible();
  });

  it("says when the part a comment points at changed", async () => {
    await renderPage(CommentCard, {
      comment: row({ status: "detached" }),
      slideNumber: 4,
      now: NOW,
    });
    await expect.element(page.getByText("This part changed since v2.")).toBeVisible();
    await expect.element(page.getByText("three times faster")).toBeVisible();
  });

  it("folds a resolved comment to one line, and opens it again on click", async () => {
    const onreopen = vi.fn();
    await renderPage(CommentCard, {
      comment: row({ status: "resolved", resolvedAt: new Date(NOW).toISOString() }),
      slideNumber: 4,
      now: NOW,
      canResolve: true,
      onreopen,
    });
    await expect.element(page.getByText("three times faster")).not.toBeInTheDocument();
    await page.getByRole("button", { name: "Reopen" }).click();
    expect(onreopen).toHaveBeenCalledOnce();
    await page.getByRole("button", { name: /Sato Yuki/ }).click();
    await expect.element(page.getByText("three times faster")).toBeVisible();
  });

  it("names the slide and element of an element comment", async () => {
    await renderPage(CommentCard, {
      comment: row({
        targets: [
          {
            kind: "element",
            path: "slides/intro.html",
            name: "h2.title",
            text: "Why dek",
            box: { x: 0, y: 0, width: 10, height: 10 },
          },
        ],
      }),
      slideNumber: 4,
      now: NOW,
    });
    await expect.element(page.getByRole("button", { name: "Slide 4 · Why dek" })).toBeVisible();
  });

  it("offers to send again a comment that did not go", async () => {
    const onretry = vi.fn();
    await renderPage(CommentCard, {
      comment: { ...row(), failed: true },
      slideNumber: 4,
      now: NOW,
      onretry,
    });
    await expect.element(page.getByText(/Not sent\./)).toBeVisible();
    await page.getByRole("button", { name: "Try again" }).click();
    expect(onretry).toHaveBeenCalledOnce();
  });

  it("collapses a long thread to its last reply", async () => {
    const reply = (n: number) => ({
      id: `r_${n}`,
      author: { name: `Reader ${n}`, handle: `reader${n}` },
      text: `Reply ${n}`,
      createdAt: new Date(NOW).toISOString(),
    });
    await renderPage(CommentCard, {
      comment: row({ thread: [1, 2, 3, 4].map(reply) }),
      slideNumber: 4,
      now: NOW,
    });
    await expect.element(page.getByText("Reply 4")).toBeVisible();
    await expect.element(page.getByText("Reply 1")).not.toBeInTheDocument();
    await userEvent.click(page.getByRole("button", { name: "3 more replies" }));
    await expect.element(page.getByText("Reply 1")).toBeVisible();
  });

  it("speaks Japanese on a Japanese page", async () => {
    await renderPage(
      CommentCard,
      { comment: row(), slideNumber: 4, now: NOW, canResolve: true },
      { lang: "ja" },
    );
    await expect.element(page.getByRole("button", { name: "解決にする" })).toBeVisible();
    await expect.element(page.getByText("3 日前")).toBeVisible();
  });
});
