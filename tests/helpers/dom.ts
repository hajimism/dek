import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { renderDeckHtml } from "../../src/core/document.ts";
import { playerScript } from "../../src/runtime/player.ts";
import { deckChannelName } from "../../src/runtime/routes.ts";

/** The channel the mounted player posts on, so a test can play another window of the deck. */
export function playerChannelName(): string {
  const slides = JSON.parse(document.getElementById("dek-data")?.textContent ?? "[]") as {
    slug: string;
  }[];
  return deckChannelName(
    document.body.dataset.deck,
    slides.map((slide) => slide.slug),
  );
}

// Bun shares BroadcastChannel across the test process; close the player's on unmount.
const openChannels: BroadcastChannel[] = [];

export async function mountPlayer(
  deckDir: string,
  options: {
    url?: string;
    mode?: "player" | "video";
    /** Runs after the page exists and before the player starts, e.g. to block storage. */
    beforeStart?: () => void;
  } = {},
): Promise<void> {
  const html = await renderDeckHtml(deckDir, { mode: options.mode ?? "player", playerScript: "" });
  GlobalRegistrator.register({ url: options.url ?? "file:///deck.html", width: 1280, height: 720 });
  document.documentElement.innerHTML = html
    .replace(/^<!DOCTYPE html>\s*<html[^>]*>/, "")
    .replace(/<\/html>\s*$/, "");
  (document as { getAnimations?: () => Animation[] }).getAnimations ??= () => [];
  // innerHTML does not run scripts; slide scripts must register before the player starts.
  for (const el of document.querySelectorAll("script[data-dek-slides]")) {
    // biome-ignore lint/security/noGlobalEval: slide scripts must see happy-dom globals
    // biome-ignore lint/complexity/noCommaOperator: indirect eval
    (0, eval)(el.textContent ?? "");
  }
  options.beforeStart?.();
  const Channel = globalThis.BroadcastChannel;
  globalThis.BroadcastChannel = class extends Channel {
    constructor(name: string) {
      super(name);
      openChannels.push(this);
    }
  };
  try {
    // biome-ignore lint/security/noGlobalEval: compiled IIFE must see happy-dom globals
    // biome-ignore lint/complexity/noCommaOperator: indirect eval
    (0, eval)(await playerScript());
  } finally {
    globalThis.BroadcastChannel = Channel;
  }
}

export async function unmountPlayer(): Promise<void> {
  for (const channel of openChannels.splice(0)) {
    channel.close();
  }
  await GlobalRegistrator.unregister();
}

/** Dispatch a keydown on `target` (the document by default); returns whether it was prevented. */
export function pressKey(
  key: string,
  init: KeyboardEventInit = {},
  target: EventTarget = document,
): boolean {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event.defaultPrevented;
}

export const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
export const currentSlug = (): string | null | undefined =>
  document.querySelector("#deck > .slide.is-current")?.getAttribute("data-slug");
export const dekGo = (pos: { slideIndex: number; beatIndex: number }): Promise<void> =>
  (window as unknown as { dekGo: (p: unknown) => Promise<void> }).dekGo(pos);
export const dekLive = (event: unknown): Promise<void> =>
  (window as unknown as { dekLive: (e: unknown) => Promise<void> }).dekLive(event);
