import { createRawSnippet } from "svelte";
import { expect, it } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";
import Badge from "../../src/ui/Badge.svelte";

it("renders a component in the browser", async () => {
  render(Badge, {
    tone: "success",
    children: createRawSnippet(() => ({ render: () => "<span>Public</span>" })),
  });
  await expect.element(page.getByText("Public")).toBeVisible();
});
