import { describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { PublicComment } from "../../../../src/pub/protocol.ts";
import PublicComments from "../../src/model/comment/public/ui/public-comments.svelte";
import LikeButton from "../../src/model/deck/like/ui/like-button.svelte";
import { renderPage } from "./setup.ts";

const by = (handle: string) => ({ name: handle, handle });
const comments: PublicComment[] = [
  {
    id: "p_1",
    author: by("demo"),
    text: "Great talk",
    createdAt: "2026-11-13T11:00:00.000Z",
    editedAt: null,
    replies: [
      {
        id: "p_2",
        author: by("sato"),
        text: "Agreed",
        createdAt: "2026-11-13T11:30:00.000Z",
        editedAt: null,
      },
    ],
  },
  {
    id: "p_3",
    author: by("sato"),
    text: "Slides please",
    createdAt: "2026-11-13T11:40:00.000Z",
    editedAt: "2026-11-13T11:45:00.000Z",
    replies: [],
  },
];
const base = {
  comments,
  canPost: true,
  isOwner: false,
  signinHref: "/signin",
  onpost: async () => true,
  onedit: async () => true,
  ondelete: async () => {},
};

describe("PublicComments", () => {
  it("lists comments oldest first with their replies, and lets their author change them", async () => {
    // The viewer is @demo.
    await renderPage(PublicComments, base);
    await expect.element(page.getByText("Slides please")).toBeInTheDocument();
    const articles = page.getByRole("article");
    expect(articles.elements().map((each) => each.querySelector(".text")?.textContent)).toEqual([
      "Great talk",
      "Agreed",
      "Slides please",
    ]);
    const theirs = articles.filter({ hasText: "Slides please" });
    expect(theirs.element().textContent).toContain("edited");
    await expect
      .element(articles.filter({ hasText: "Great talk" }).getByRole("button", { name: "Edit" }))
      .toBeInTheDocument();
    await expect.element(theirs.getByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    await expect.element(theirs.getByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  it("lets the deck's owner delete anyone's comment, after asking", async () => {
    const ondelete = vi.fn(async () => {});
    await renderPage(PublicComments, { ...base, isOwner: true, ondelete });
    const theirs = page.getByRole("article").filter({ hasText: "Slides please" });
    await theirs.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Delete it and its replies?" }).click();
    expect(ondelete).toHaveBeenCalledWith("p_3");
  });

  it("sends a comment, and a reply to one", async () => {
    const onpost = vi.fn(async () => true);
    await renderPage(PublicComments, { ...base, onpost });
    await page.getByPlaceholder("Add a comment…").fill("Thanks!");
    await page.getByRole("button", { name: "Comment", exact: true }).click();
    expect(onpost).toHaveBeenLastCalledWith({ text: "Thanks!" }, null);
    await page
      .getByRole("article")
      .filter({ hasText: "Great talk" })
      .getByRole("button", { name: "Reply" })
      .click();
    await page.getByPlaceholder("Reply…").fill("Me too");
    await userEvent.keyboard("{Control>}{Enter}{/Control}");
    expect(onpost).toHaveBeenLastCalledWith({ text: "Me too" }, "p_1");
  });

  it("says how to comment when one may not yet, and when no one may", async () => {
    await renderPage(PublicComments, { ...base, canPost: false }, { viewer: null });
    await expect
      .element(page.getByRole("link", { name: "Sign in to comment" }))
      .toBeInTheDocument();
    await renderPage(PublicComments, { ...base, canPost: false, off: true });
    await expect.element(page.getByText("Comments are off for this talk.")).toBeInTheDocument();
  });
});

describe("LikeButton", () => {
  it("shows the count, and likes or takes the like back", async () => {
    const onlike = vi.fn();
    const rendered = await renderPage(LikeButton, {
      likes: { count: 2, liked: false },
      canLike: true,
      onlike,
    });
    const button = page.getByRole("button", { name: "Like" });
    await expect.element(button).toHaveAttribute("aria-pressed", "false");
    await expect.element(button).toHaveTextContent("2");
    await button.click();
    expect(onlike).toHaveBeenLastCalledWith(true);
    await rendered.rerender({ likes: { count: 3, liked: true }, canLike: true, onlike });
    await expect.element(button).toHaveAttribute("aria-pressed", "true");
  });

  it("bursts when a reader likes, and not for a like already there", async () => {
    let likes = { count: 4, liked: true };
    const rendered = await renderPage(LikeButton, { likes, canLike: true, onlike });
    function onlike(liked: boolean) {
      likes = { count: likes.count + (liked ? 1 : -1), liked };
      rendered.rerender({ likes, canLike: true, onlike });
    }
    const button = page.getByRole("button", { name: "Like" });
    await expect.element(button).toHaveAttribute("aria-pressed", "true");
    expect(document.querySelector("[data-motion]")).toBeNull();
    expect(document.querySelector(".burst")).toBeNull();

    await button.click();
    await expect.element(button).toHaveAttribute("data-motion", "unlike");
    expect(document.querySelector(".burst")).toBeNull();

    await button.click();
    await expect.element(button).toHaveAttribute("data-motion", "like");
    await expect.element(button).toHaveTextContent("4");
    expect(document.querySelector(".burst")).not.toBeNull();
  });

  it("sends a reader not signed in to sign in", async () => {
    await renderPage(
      LikeButton,
      { likes: { count: 0, liked: false }, canLike: false, signinHref: "/signin" },
      { viewer: null },
    );
    await expect
      .element(page.getByRole("link", { name: "Sign in to like" }))
      .toHaveAttribute("href", "/signin");
  });
});
