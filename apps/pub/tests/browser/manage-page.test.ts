import { afterEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
// The page's own tokens and base styles, as the layout loads them, so widths are the real ones.
import "../../src/common/ui/tokens.css";
import type { DeckStatus } from "../../../../src/pub/protocol.ts";
import { toasts } from "../../src/common/ui/toast.svelte.ts";
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
    await expect
      .element(page.getByRole("link", { name: "Open talk" }))
      .toHaveAttribute("href", "/@demo/why-dek?key=qrstuvwxyz0123456789abcdef");
    expect(fetch.mock.calls.map(([path, init]) => [path, init?.method, init?.body])).toEqual([
      [`/api/decks/${status.id}`, "PATCH", JSON.stringify({ newLink: true })],
    ]);
  });

  it("opens the talk, and goes back to it, at the URL it is shared at", async () => {
    await renderPage(ManagePage, { ...props, status: linked });
    const shared = "/@demo/why-dek?key=0123456789abcdefghijklmnop";
    await expect
      .element(page.getByRole("link", { name: "Open talk" }))
      .toHaveAttribute("href", shared);
    await expect
      .element(page.getByRole("link", { name: "Back to the talk" }))
      .toHaveAttribute("href", shared);
  });

  it("offers no new link on a talk that is not link only", async () => {
    await renderPage(ManagePage, props);
    await expect.element(page.getByRole("button", { name: "New link" })).not.toBeInTheDocument();
  });
});

describe("ManagePage's delete", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("deletes the talk only once its slug is typed, then goes to the owner's profile", async () => {
    const fetch = vi.fn(
      async (_path: string, _init?: RequestInit) =>
        new Response(
          JSON.stringify({ deleted: true, id: status.id, owner: "demo", slug: "why-dek" }),
        ),
    );
    vi.stubGlobal("fetch", fetch);
    const ondeleted = vi.fn();
    await renderPage(ManagePage, { ...props, ondeleted });
    await page.getByRole("button", { name: "Delete this talk" }).click();
    const dialog = page.getByRole("dialog", { name: "Delete “Why dek”?" });
    const confirm = dialog.getByRole("button", { name: "Delete for good" });
    await expect.element(confirm).toBeDisabled();
    const field = dialog.getByLabelText("To confirm, type why-dek");
    await expect.element(field).toHaveFocus();
    await field.fill("why-de");
    await expect.element(confirm).toBeDisabled();
    await field.fill("why-dek");
    await confirm.click();
    await expect.poll(() => ondeleted.mock.calls).toEqual([["/@demo"]]);
    expect(fetch.mock.calls.map(([path, init]) => [path, init?.method])).toEqual([
      [`/api/decks/${status.id}`, "DELETE"],
    ]);
  });

  it("keeps the talk when the dialog is cancelled, and asks for the slug afresh", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await renderPage(ManagePage, props);
    await page.getByRole("button", { name: "Delete this talk" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabelText("To confirm, type why-dek").fill("why-dek");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await page.getByRole("button", { name: "Delete this talk" }).click();
    await expect.element(dialog.getByLabelText("To confirm, type why-dek")).toHaveValue("");
    await expect.element(dialog.getByRole("button", { name: "Delete for good" })).toBeDisabled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("says when the talk could not be deleted, and stays", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { code: "internal", message: "down" } }), {
            status: 500,
          }),
      ),
    );
    const ondeleted = vi.fn();
    await renderPage(ManagePage, { ...props, ondeleted });
    await page.getByRole("button", { name: "Delete this talk" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabelText("To confirm, type why-dek").fill("why-dek");
    await dialog.getByRole("button", { name: "Delete for good" }).click();
    await expect
      .poll(() => toasts.map((note) => [note.message, note.tone]))
      .toContainEqual(["Something went wrong. down", "error"]);
    await expect.element(dialog.getByRole("button", { name: "Delete for good" })).toBeEnabled();
    expect(ondeleted).not.toHaveBeenCalled();
  });
});
