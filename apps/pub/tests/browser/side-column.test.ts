import { describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import SideColumn from "../../src/model/deck/feature/talk/ui/side-column.svelte";
import { renderPage } from "./setup.ts";

const slides = [
  { slug: "cover", title: "Why dek" },
  { slug: "plan", title: "The plan" },
  { slug: "end", title: "" },
];
const base = {
  slides,
  current: "plan",
  author: "Hajime",
  date: "2026-09-25",
  version: 3,
  minutes: 12,
  onslide: () => {},
  onreview: () => {},
};

describe("SideColumn", () => {
  it("lists the slides by title as links into the article, and marks the one being read", async () => {
    const onslide = vi.fn();
    await renderPage(SideColumn, { ...base, review: null, onslide });
    const toc = page.getByRole("navigation", { name: "Slides" });
    await expect
      .element(toc.getByRole("link", { name: "2 The plan" }))
      .toHaveAttribute("aria-current", "location");
    await expect
      .element(toc.getByRole("link", { name: "1 Why dek" }))
      .not.toHaveAttribute("aria-current");
    // A slide with no title goes by its slug.
    const end = toc.getByRole("link", { name: "3 end" });
    await expect.element(end).toHaveAttribute("href", "#end");
    await end.click();
    expect(onslide).toHaveBeenCalledWith("end");
    expect(location.hash).toBe("");
  });

  it("gives the talk's details, each named for what it is", async () => {
    await renderPage(SideColumn, { ...base, review: null });
    const details = page.getByRole("region", { name: "About this talk" });
    const row = (term: string) => details.getByRole("term").filter({ hasText: term });
    await expect.element(row("Author")).toBeInTheDocument();
    await expect.element(details.getByText("Hajime")).toBeInTheDocument();
    await expect.element(row("Talk date")).toBeInTheDocument();
    await expect.element(row("Version")).toBeInTheDocument();
    await expect.element(details.getByText("v3")).toBeInTheDocument();
    await expect.element(row("Duration")).toBeInTheDocument();
    await expect.element(details.getByText("12 min")).toBeInTheDocument();
    await expect.element(row("Slides")).toBeInTheDocument();
    await expect.element(details.getByText("3", { exact: true })).toBeInTheDocument();
  });

  it("leaves out the duration of a talk whose frontmatter has none", async () => {
    await renderPage(SideColumn, { ...base, minutes: null, review: null });
    await expect.element(page.getByRole("term").filter({ hasText: "Slides" })).toBeInTheDocument();
    expect(page.getByRole("term").filter({ hasText: "Duration" }).query()).toBeNull();
  });

  it("opens the review full screen, for a reader of it", async () => {
    const onreview = vi.fn();
    await renderPage(SideColumn, { ...base, review: { open: 4 }, onreview });
    await expect.element(page.getByText("4 open threads")).toBeInTheDocument();
    await page.getByRole("button", { name: "Open the review" }).click();
    expect(onreview).toHaveBeenCalled();
  });

  it("says nothing of the review to anyone else", async () => {
    await renderPage(SideColumn, { ...base, review: null });
    await expect
      .element(page.getByRole("button", { name: "Open the review" }))
      .not.toBeInTheDocument();
  });
});
