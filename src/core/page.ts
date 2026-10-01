import { escapeAttr } from "./escape.ts";

// What the deck page and the player runtime agree on: the ids the page is built with, and the
// settings it carries on <body>. The runtime bundles this for the browser: no Node imports.

/** The ids of the page's parts, by what they are. */
export const PAGE_ID = {
  deck: "deck",
  data: "dek-data",
  shell: "dek-shell",
  rail: "dek-rail",
  railResize: "dek-rail-resize",
  current: "dek-current",
  currentStage: "dek-current-stage",
  presenter: "dek-presenter",
  progress: "dek-progress",
  nextPanel: "dek-next-panel",
  nextStage: "dek-next-stage",
  nextEnd: "dek-next-end",
  next: "dek-next",
  notesPanel: "dek-notes-panel",
  beats: "dek-beats",
  script: "dek-script",
  presenterBar: "dek-presenter-bar",
  page: "dek-page",
  elapsed: "dek-elapsed",
  budget: "dek-budget",
  laser: "dek-laser",
  laserToggle: "dek-laser-toggle",
  markToggle: "dek-mark-toggle",
  hint: "dek-hint",
  announce: "dek-announce",
} as const;

export type PageMode = "player" | "presenter" | "video";

/** The page's settings, written on <body> as `data-*` and read back once by the runtime. */
export type PageConfig = {
  mode: PageMode;
  deck: string;
  /** The dev server's page: it follows the server's socket and events. */
  live: boolean;
  /** What a presenter page sends as `?token=` on its live channels. */
  liveToken?: string;
};

/** `config` as the attributes of <body>, values escaped. */
export function pageConfigAttrs(config: PageConfig): string {
  return [
    ` data-mode="${config.mode}"`,
    ` data-deck="${escapeAttr(config.deck)}"`,
    config.live ? ` data-live="true"` : "",
    config.liveToken ? ` data-live-token="${escapeAttr(config.liveToken)}"` : "",
  ].join("");
}

/** The settings `pageConfigAttrs` wrote on `body`. */
export function readPageConfig(body: HTMLElement): PageConfig {
  const { mode, deck, live, liveToken } = body.dataset;
  return {
    mode: mode === "presenter" || mode === "video" ? mode : "player",
    deck: deck ?? "",
    live: live === "true",
    ...(liveToken ? { liveToken } : {}),
  };
}
