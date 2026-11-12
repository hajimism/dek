import { describe, expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import type { ArticleSlide } from "../../src/server/pages.ts";
import Article from "../../src/ui/talk/Article.svelte";
import { renderPage } from "./setup.ts";

const slides: ArticleSlide[] = [
  {
    slug: "intro",
    title: "Intro",
    steps: ["0"],
    paragraphs: ["Hello there. dek writes the script first, then the slides.", "dek is fast."],
    picture: null,
  },
];

function select(paragraph: Element, from: number, to: number) {
  // Svelte may leave empty text nodes around; the words are in the one that is not empty.
  const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
  let text = walker.nextNode() as Text | null;
  while (text && text.length === 0) {
    text = walker.nextNode() as Text | null;
  }
  if (!text) {
    throw new Error("the paragraph has no text");
  }
  const range = document.createRange();
  range.setStart(text, from);
  range.setEnd(text, to);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

describe("commenting on a selection", () => {
  it("offers a Comment button and quotes the selection with its surroundings", async () => {
    const oncommentquote = vi.fn();
    await renderPage(Article, {
      slides,
      lang: "en",
      script: "public",
      comments: [],
      size: { width: 1280, height: 720 },
      canComment: true,
      oncommentquote,
    });
    const paragraph = document.querySelector('[data-slug="intro"] p[data-p="0"]');
    expect(paragraph).not.toBeNull();
    const text = slides[0]?.paragraphs?.[0] ?? "";
    const start = text.indexOf("writes the script");
    select(paragraph as Element, start - 1, start + "writes the script".length + 1);
    const button = page.getByRole("button", { name: "Comment on selection" });
    await expect.element(button).toBeVisible();
    await button.click();
    expect(oncommentquote).toHaveBeenCalledWith({
      slug: "intro",
      quote: {
        quote: "writes the script",
        prefix: "Hello there. dek ",
        suffix: " first, then the slides.",
      },
    });
  });

  it("offers nothing to someone who may not comment", async () => {
    await renderPage(Article, {
      slides,
      lang: "en",
      script: "public",
      comments: [],
      size: { width: 1280, height: 720 },
      canComment: false,
    });
    const paragraph = document.querySelector('[data-slug="intro"] p[data-p="0"]') as Element;
    select(paragraph, 0, 5);
    await new Promise((resolve) => setTimeout(resolve, 250));
    await expect
      .element(page.getByRole("button", { name: "Comment on selection" }))
      .not.toBeInTheDocument();
  });

  it("highlights the quoted words of an open comment", async () => {
    await renderPage(Article, {
      slides,
      lang: "en",
      script: "public",
      comments: [
        {
          number: 1,
          id: "c_1",
          slug: "intro",
          step: "0",
          status: "open",
          text: "Source?",
          targets: [{ kind: "quote", quote: "dek is fast", prefix: "", suffix: "." }],
          author: { name: "Sato", handle: "sato", guest: false },
          version: 1,
          url: "",
          thread: [],
          createdAt: "2026-11-13T00:00:00Z",
          resolvedAt: null,
        },
      ],
      size: { width: 1280, height: 720 },
    });
    const mark = document.querySelector('mark[data-ids="c_1"]');
    expect(mark?.textContent).toBe("dek is fast");
  });
});
