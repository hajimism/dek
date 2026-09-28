import { renderDeckHtml } from "../core/document.ts";
import type { Project } from "../core/resolve.ts";
import { errorPage, htmlResponse, renderIndexHtml } from "./routes.ts";

export type DevPages = {
  /** A deck's live page; a deck that fails to render answers with its error. */
  deckPage(dir: string, mode: "player" | "presenter"): Response;
  /** The project's list of decks. */
  indexPage(): Response;
  /** Forget every rendered page, after an edit that may change what they show. */
  clear(): void;
};

/** The pages a dev server renders, each kept until `clear`. */
export function createDevPages(options: {
  embed: { playerScript: string; liveReloadScript: string };
  remote: boolean;
  /** Embedded on the presenter page, so its stream and moves are let through. */
  password: string | undefined;
  project: () => Project;
}): DevPages {
  const { embed, remote, password } = options;
  const pages = new Map<string, string>();

  const cached = (key: string, render: () => string): string => {
    const hit = pages.get(key);
    if (hit !== undefined) {
      return hit;
    }
    const html = render();
    pages.set(key, html);
    return html;
  };

  return {
    deckPage(dir, mode) {
      try {
        return htmlResponse(
          cached(`${dir}:${mode}`, () =>
            renderDeckHtml(dir, {
              playerScript: embed.playerScript,
              target: {
                kind: "dev",
                mode,
                includeNotes: mode === "presenter" || !remote,
                liveReloadScript: embed.liveReloadScript,
                ...(mode === "presenter" && password ? { liveToken: password } : {}),
              },
            }),
          ),
        );
      } catch (error) {
        return htmlResponse(errorPage(error), 500);
      }
    },
    indexPage() {
      return htmlResponse(
        cached("index", () => {
          const { decks, failed } = options.project();
          return renderIndexHtml(
            decks.map((deck) => ({ name: deck.name, title: deck.deck.title })),
            failed.map((entry) => ({ name: entry.name })),
          );
        }),
      );
    },
    clear() {
      pages.clear();
    },
  };
}
