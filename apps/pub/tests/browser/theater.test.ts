import { describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import TheaterHost from "./fixtures/theater-host.svelte";
import { renderPage } from "./setup.ts";

describe("Theater", () => {
  it("goes full screen with a header naming the talk and where it stands", async () => {
    await renderPage(TheaterHost, {});
    await expect.element(page.getByText("Why dek")).not.toBeInTheDocument();
    await page.getByRole("button", { name: "Enter" }).click();
    await expect.element(page.getByText("Why dek")).toBeInTheDocument();
    await expect.element(page.getByText("3 / 18")).toBeInTheDocument();
    await expect.element(page.getByTestId("panel")).not.toBeInTheDocument();
  });

  it("opens the review beside the slide from its button, from c, and from the deck's c", async () => {
    await renderPage(TheaterHost, {});
    await page.getByRole("button", { name: "Enter" }).click();
    const review = page.getByRole("button", { name: /Review/ });
    await review.click();
    await expect.element(page.getByTestId("panel")).toBeInTheDocument();
    await expect.element(review).toHaveAttribute("aria-pressed", "true");
    await userEvent.keyboard("c");
    await expect.element(page.getByTestId("panel")).not.toBeInTheDocument();
    await page.getByRole("button", { name: "Key c from the deck" }).click();
    await expect.element(page.getByTestId("panel")).toBeInTheDocument();
  });

  it("leaves full screen from its own button", async () => {
    await renderPage(TheaterHost, {});
    await page.getByRole("button", { name: "Enter" }).click();
    await page.getByRole("button", { name: "Leave full screen" }).click();
    await expect.element(page.getByText("Why dek")).not.toBeInTheDocument();
  });

  it("offers no review to someone who may not read it", async () => {
    await renderPage(TheaterHost, { reviewCount: null });
    await page.getByRole("button", { name: "Enter" }).click();
    await expect.element(page.getByRole("button", { name: /Review/ })).not.toBeInTheDocument();
    await userEvent.keyboard("c");
    await expect.element(page.getByTestId("panel")).not.toBeInTheDocument();
  });
});
