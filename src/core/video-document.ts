import { renderDeckDocument } from "./document.ts";
import type { ResolvedDeck } from "./resolve.ts";

/**
 * The whole deck as `dekc video` plays it: every slide, assets inlined, no notes, and the player
 * runtime that walks it. Motion stills, morph frames and the video itself all run on this page.
 */
export function videoDocument({ deck }: ResolvedDeck, playerScript: string): string {
  return renderDeckDocument(deck, {
    playerScript,
    target: { kind: "video" },
  });
}
