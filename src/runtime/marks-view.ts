/// <reference lib="dom" />
import { decodePosition, encodePosition } from "../core/live-protocol.ts";
import { PAGE_ID } from "../core/page.ts";
import { positionsEqual } from "../core/position.ts";
import type { Position } from "../core/step.ts";

export type MarksView = {
  /** Mark the beat on screen, or unmark it; true, since the key is the marks' on this page. */
  toggle(): boolean;
  /** Show whether the beat at `pos` is marked, and which beats of its slide are. */
  render(pos: Position): void;
};

/**
 * The marks the speaker leaves while rehearsing on beats that want rewriting, kept by the dev
 * server in a file an agent reads with `dekc marks`. Only a page whose presenter bar has the mark
 * button has marks, so a built file never tries to reach a server it does not have.
 */
export function createMarksView(options: {
  /** The dev server's marks endpoint for this deck, with the presenter's token. */
  url: string;
  /** The beat on screen. */
  current: () => Position;
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
}): MarksView | undefined {
  const button = document.getElementById(PAGE_ID.markToggle);
  if (!button) {
    return undefined;
  }
  let marked: Position[] = [];

  function render(pos: Position): void {
    const isMarked = (beatIndex: number): boolean =>
      marked.some((mark) => positionsEqual(mark, { slideIndex: pos.slideIndex, beatIndex }));
    button?.setAttribute("aria-pressed", String(isMarked(pos.beatIndex)));
    for (const item of document.querySelectorAll(`#${PAGE_ID.beats} [data-beat-index]`)) {
      item.classList.toggle("is-marked", isMarked(Number(item.getAttribute("data-beat-index"))));
    }
  }

  /** Ask the server, and draw what it says the marks are now; a refusal is said on the button. */
  async function ask(init?: RequestInit): Promise<void> {
    try {
      const response = await options.fetch(options.url, init);
      if (!response.ok) {
        throw new Error(`the dev server answered ${response.status}`);
      }
      const body = (await response.json()) as { positions?: unknown[] };
      marked = (body.positions ?? []).flatMap((raw) => decodePosition(raw) ?? []);
      button?.removeAttribute("data-error");
      button?.setAttribute("title", button.getAttribute("aria-label") ?? "");
    } catch (error) {
      button?.setAttribute("data-error", "");
      button?.setAttribute(
        "title",
        `not marked: ${error instanceof Error ? error.message : error}`,
      );
    }
    render(options.current());
  }

  function toggle(): boolean {
    void ask({
      method: "POST",
      headers: { "content-type": "application/json" },
      body: encodePosition(options.current()),
    });
    return true;
  }

  button.addEventListener("click", () => toggle());
  void ask();
  return { toggle, render };
}
