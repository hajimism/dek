import { describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import CommentsPanel from "../../src/model/comment/ui/comments-panel.svelte";
import { renderPage } from "./setup.ts";

const handlers = {
  comments: [],
  slideNumbers: new Map<string, number>(),
  onselect: () => {},
  onanchor: () => {},
  onresolve: async () => {},
  onreopen: async () => {},
  onwiden: async () => {},
  onreply: async () => true,
  oncreate: async () => true,
  oncanceldraft: () => {},
  onretry: () => {},
  oncopylink: () => {},
};

describe("CommentsPanel", () => {
  it("lets a reader of the comments turn their mail off and on", async () => {
    const onmute = vi.fn();
    const rendered = await renderPage(CommentsPanel, { ...handlers, muted: false, onmute });
    const bell = page.getByRole("button", { name: "Email me about these comments" });
    await expect.element(bell).toHaveAttribute("aria-pressed", "true");
    await bell.click();
    expect(onmute).toHaveBeenLastCalledWith(true);

    await rendered.rerender({ ...handlers, muted: true, onmute });
    await expect.element(bell).toHaveAttribute("aria-pressed", "false");
    await bell.click();
    expect(onmute).toHaveBeenLastCalledWith(false);
  });

  it("offers no mail to someone who is not signed in", async () => {
    await renderPage(CommentsPanel, { ...handlers, muted: null });
    await expect
      .element(page.getByRole("button", { name: "Email me about these comments" }))
      .not.toBeInTheDocument();
  });
});
