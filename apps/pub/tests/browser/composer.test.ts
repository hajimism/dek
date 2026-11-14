import { describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import Composer from "../../src/model/comment/ui/composer.svelte";
import { renderPage } from "./setup.ts";

describe("Composer", () => {
  it("keeps each new thread to the team unless told to share it with guests", async () => {
    const onsubmit = vi.fn(async () => true);
    await renderPage(Composer, { scopes: true, onsubmit });
    const share = page.getByRole("checkbox", { name: "Share with guests" });
    await expect.element(share).not.toBeChecked();
    await page.getByRole("textbox").fill("For us only");
    await page.getByRole("button", { name: "Comment" }).click();
    expect(onsubmit).toHaveBeenLastCalledWith({ text: "For us only", scope: "team" });

    await share.click();
    await expect.element(share).toBeChecked();
    await page.getByRole("textbox").fill("For everyone");
    await page.getByRole("button", { name: "Comment" }).click();
    expect(onsubmit).toHaveBeenLastCalledWith({ text: "For everyone", scope: "shared" });
    await expect.element(share).not.toBeChecked();
  });

  it("offers no choice, and sends none, to the guests' side", async () => {
    const onsubmit = vi.fn(async () => true);
    await renderPage(Composer, { onsubmit });
    await expect
      .element(page.getByRole("checkbox", { name: "Share with guests" }))
      .not.toBeInTheDocument();
    await page.getByRole("textbox").fill("Looks good");
    await page.getByRole("button", { name: "Comment" }).click();
    expect(onsubmit).toHaveBeenLastCalledWith({ text: "Looks good" });
  });
});
