import { describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import Composer from "../../src/model/comment/ui/composer.svelte";
import { renderPage } from "./setup.ts";

describe("Composer", () => {
  it("keeps a new thread to the team until told to share it", async () => {
    const onsubmit = vi.fn(async () => true);
    await renderPage(Composer, { scopes: true, onsubmit });
    const team = page.getByRole("radio", { name: "Team only" });
    await expect.element(team).toBeChecked();
    await page.getByRole("textbox").fill("For us only");
    await page.getByRole("button", { name: "Comment" }).click();
    expect(onsubmit).toHaveBeenLastCalledWith({ text: "For us only", scope: "team" });

    await page.getByRole("radio", { name: "Client too" }).click();
    await page.getByRole("textbox").fill("For everyone");
    await page.getByRole("button", { name: "Comment" }).click();
    expect(onsubmit).toHaveBeenLastCalledWith({ text: "For everyone", scope: "shared" });
  });

  it("offers no choice, and sends none, to the client's side", async () => {
    const onsubmit = vi.fn(async () => true);
    await renderPage(Composer, { onsubmit });
    await expect.element(page.getByRole("radio", { name: "Team only" })).not.toBeInTheDocument();
    await page.getByRole("textbox").fill("Looks good");
    await page.getByRole("button", { name: "Comment" }).click();
    expect(onsubmit).toHaveBeenLastCalledWith({ text: "Looks good" });
  });
});
