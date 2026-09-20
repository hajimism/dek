import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { renderDeckHtml } from "../../src/core/document.ts";
import { playerScript } from "../../src/runtime/player.ts";

export async function mountPlayer(deckDir: string, options: { url?: string } = {}): Promise<void> {
  const html = await renderDeckHtml(deckDir, { mode: "player", playerScript: "" });
  GlobalRegistrator.register({ url: options.url ?? "file:///deck.html", width: 1280, height: 720 });
  document.documentElement.innerHTML = html
    .replace(/^<!DOCTYPE html>\s*<html[^>]*>/, "")
    .replace(/<\/html>\s*$/, "");
  (document as { getAnimations?: () => Animation[] }).getAnimations ??= () => [];
  // biome-ignore lint/security/noGlobalEval: compiled IIFE must see happy-dom globals
  // biome-ignore lint/complexity/noCommaOperator: indirect eval
  (0, eval)(await playerScript());
}

export async function unmountPlayer(): Promise<void> {
  await GlobalRegistrator.unregister();
}

export function pressKey(key: string): void {
  document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

export const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
export const currentSlug = (): string | null | undefined =>
  document.querySelector("#deck > .slide.is-current")?.getAttribute("data-slug");
export const dekGo = (pos: { slideIndex: number; beatIndex: number }): Promise<void> =>
  (window as unknown as { dekGo: (p: unknown) => Promise<void> }).dekGo(pos);
export const dekLive = (event: unknown): Promise<void> =>
  (window as unknown as { dekLive: (e: unknown) => Promise<void> }).dekLive(event);
