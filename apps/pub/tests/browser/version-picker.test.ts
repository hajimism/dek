import { describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import VersionPicker from "../../src/model/deck/feature/talk/ui/version-picker.svelte";
import { renderPage } from "./setup.ts";

const versions = [
  { n: 3, message: "tighter ending", createdAt: "2026-11-13T12:00:00.000Z" },
  { n: 2, message: null, createdAt: "2026-11-12T12:00:00.000Z" },
  { n: 1, message: null, createdAt: "2026-11-11T12:00:00.000Z" },
];

describe("VersionPicker", () => {
  it("says when the page shows a draft, and what the client's side reads instead", async () => {
    await renderPage(VersionPicker, { versions, version: 3, current: 2, onpick: () => {} });
    await expect
      .element(page.getByText("Draft: version 3. The client’s side reads version 2."))
      .toBeInTheDocument();
    await expect.element(page.getByRole("combobox", { name: "Version" })).toHaveValue("3");
    await expect
      .element(page.getByRole("option", { name: "v3 · draft — tighter ending" }))
      .toBeInTheDocument();
    await expect.element(page.getByRole("option", { name: "v2 · current" })).toBeInTheDocument();
  });

  it("switches to the version chosen", async () => {
    const onpick = vi.fn();
    await renderPage(VersionPicker, { versions, version: 2, current: 2, onpick });
    await expect.element(page.getByText(/^Draft:/)).not.toBeInTheDocument();
    await page.getByRole("combobox", { name: "Version" }).selectOptions("3");
    expect(onpick).toHaveBeenCalledWith(3);
  });

  it("says when no version is current yet", async () => {
    await renderPage(VersionPicker, { versions, version: 3, current: null, onpick: () => {} });
    await expect
      .element(
        page.getByText(
          "Draft: version 3. No version is current, so the client’s side sees nothing yet.",
        ),
      )
      .toBeInTheDocument();
  });
});
