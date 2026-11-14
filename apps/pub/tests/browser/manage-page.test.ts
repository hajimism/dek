import { afterEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
// The page's own tokens and base styles, as the layout loads them, so widths are the real ones.
import "../../src/common/ui/tokens.css";
import type { DeckStatus } from "../../../../src/pub/protocol.ts";
import ManagePage from "../../src/model/deck/feature/manage/ui/manage-page.svelte";
import { renderPage } from "./setup.ts";

const status: DeckStatus = {
  id: "d_0123456789",
  slug: "why-dek",
  owner: "demo",
  title: "Why dek",
  url: "https://dek.pub/@demo/why-dek",
  visibility: "team",
  scriptPublic: false,
  embed: false,
  comments: "signed-in",
  current: 2,
  files: {},
};
const version = { n: 2, createdAt: "2026-11-13T10:00:00.000Z", message: "Tighten", changed: [] };
const props = { status, grants: [], version };

describe("ManagePage's visibility", () => {
  it("lists the four visibilities, narrowest first, each with who opens it", async () => {
    await renderPage(ManagePage, props);
    const group = page.getByRole("radiogroup", { name: "Visibility" });
    expect(
      group
        .getByRole("radio")
        .elements()
        .map((row) => row.querySelector("[data-label]")?.textContent?.trim()),
    ).toEqual(["Team only", "Team and guests", "Link only", "Public"]);
    await expect
      .element(group.getByRole("radio", { name: "Link only" }))
      .toHaveAccessibleDescription(
        "Anyone with the link, whose key can’t be guessed. It isn’t listed or indexed.",
      );
    await expect.element(group.getByRole("radio", { name: "Team only" })).toBeChecked();
  });

  it("asks before going public, and declined, keeps the visibility and the focus on it", async () => {
    await renderPage(ManagePage, props);
    const group = page.getByRole("radiogroup", { name: "Visibility" });
    await group.getByRole("radio", { name: "Public" }).click();
    const dialog = page.getByRole("dialog");
    await expect.element(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect.element(group.getByRole("radio", { name: "Team only" })).toBeChecked();
    await expect.element(group.getByRole("radio", { name: "Team only" })).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    await expect.element(group.getByRole("radio", { name: "Team only" })).toBeChecked();
  });

  for (const width of [375, 1280]) {
    for (const lang of ["en", "ja"] as const) {
      it(`cuts no label or hint at ${width}px in ${lang}`, async () => {
        await page.viewport(width, 900);
        await renderPage(ManagePage, props, { lang });
        const name = lang === "en" ? "Visibility" : "公開範囲";
        const group = page.getByRole("radiogroup", { name }).element();
        const texts = [...group.querySelectorAll<HTMLElement>("[data-label], [data-hint]")];
        expect(texts).toHaveLength(8);
        for (const text of texts) {
          expect(text.scrollWidth, text.textContent ?? "").toBeLessThanOrEqual(text.clientWidth);
          expect(text.getBoundingClientRect().right).toBeLessThanOrEqual(width);
        }
        expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
      });
    }
  }
});

describe("ManagePage's link", () => {
  const linked: DeckStatus = {
    ...status,
    visibility: "link",
    url: "https://dek.pub/@demo/why-dek?key=0123456789abcdefghijklmnop",
  };
  const renewed = "https://dek.pub/@demo/why-dek?key=qrstuvwxyz0123456789abcdef";

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("makes a new link only once asked twice, and shows the URL that now opens the talk", async () => {
    const fetch = vi.fn(
      async (_path: string, _init?: RequestInit) =>
        new Response(JSON.stringify({ ...linked, url: renewed })),
    );
    vi.stubGlobal("fetch", fetch);
    await renderPage(ManagePage, { ...props, status: linked });
    await expect
      .element(page.getByLabelText("Talk URL", { exact: true }))
      .toHaveTextContent(linked.url);
    await page.getByRole("button", { name: "New link" }).click();
    const dialog = page.getByRole("dialog");
    await expect
      .element(dialog.getByText(/^The link given out so far stops working\./))
      .toBeVisible();
    expect(fetch).not.toHaveBeenCalled();
    await dialog.getByRole("button", { name: "Make a new link" }).click();
    await expect
      .element(page.getByLabelText("Talk URL", { exact: true }))
      .toHaveTextContent(renewed);
    expect(fetch.mock.calls.map(([path, init]) => [path, init?.method, init?.body])).toEqual([
      [`/api/decks/${status.id}`, "PATCH", JSON.stringify({ newLink: true })],
    ]);
  });

  it("offers no new link on a talk that is not link only", async () => {
    await renderPage(ManagePage, props);
    await expect.element(page.getByRole("button", { name: "New link" })).not.toBeInTheDocument();
  });
});
