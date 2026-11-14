import { describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { TalkCard } from "../../src/model/deck/type.ts";
import ProfileTalks from "../../src/model/person/feature/profile/ui/profile-talks.svelte";
import { renderPage } from "./setup.ts";

const owner = { handle: "demo", name: "Hajime Nakagawa", image: null };
const talk = (
  slug: string,
  title: string,
  date: string,
  visibility: TalkCard["visibility"],
): TalkCard => ({
  slug,
  title,
  event: "dek sample",
  date,
  slides: 12,
  visibility,
  picture: null,
  owner,
  updatedAt: `${date}T00:00:00.000Z`,
});
const talks = [
  talk("why-dek", "Why dek", "2026-09-25", "public"),
  talk("agents", "With agents", "2025-12-04", "link"),
  talk("lt", "A lightning talk", "2024-11-08", "private"),
  talk("draft", "A talk in the making", "2024-06-01", "team"),
];

describe("ProfileTalks", () => {
  it("opens as a gallery of every talk", async () => {
    await renderPage(ProfileTalks, {
      talks,
      handle: "demo",
      isOwner: false,
      view: "gallery",
      onview: () => {},
    });
    await expect
      .element(page.getByRole("tab", { name: "Gallery" }))
      .toHaveAttribute("aria-selected", "true");
    const gallery = page.getByRole("tabpanel", { name: "Gallery" });
    await expect
      .element(gallery.getByRole("link", { name: /Why dek/ }))
      .toHaveAttribute("href", "/@demo/why-dek");
    expect(gallery.getByRole("listitem").elements()).toHaveLength(4);
    // A gallery has no years; the timeline does.
    expect(page.getByRole("heading", { name: "2025" }).query()).toBeNull();
  });

  it("shows the owner each talk's visibility", async () => {
    await renderPage(ProfileTalks, {
      talks,
      handle: "demo",
      isOwner: true,
      view: "gallery",
      onview: () => {},
    });
    await expect.element(page.getByText("Link only")).toBeInTheDocument();
    await expect.element(page.getByText("Team and guests")).toBeInTheDocument();
    await expect.element(page.getByText("Team only")).toBeInTheDocument();
  });

  it("switches to a timeline by year, by click or by arrow key", async () => {
    const onview = vi.fn();
    const rendered = await renderPage(ProfileTalks, {
      talks,
      handle: "demo",
      isOwner: false,
      view: "gallery",
      onview,
    });
    await page.getByRole("tab", { name: "Timeline" }).click();
    expect(onview).toHaveBeenLastCalledWith("timeline");

    await rendered.rerender({ talks, handle: "demo", isOwner: false, view: "timeline", onview });
    const timeline = page.getByRole("tabpanel", { name: "Timeline" });
    await expect.element(timeline.getByRole("heading", { name: "2026" })).toBeInTheDocument();
    await expect.element(timeline.getByRole("heading", { name: "2024" })).toBeInTheDocument();

    await userEvent.keyboard("{ArrowLeft}");
    expect(onview).toHaveBeenLastCalledWith("gallery");
  });
});
