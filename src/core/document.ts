import { playerChromeCss } from "./chrome.ts";
import { type DekConfig, loadConfig } from "./config.ts";
import { escapeAttr, escapeHtml } from "./escape.ts";
import { collectSlidesHtml, type PageMode, presenterSlides, readTheme } from "./html.ts";
import { presenterState } from "./presenter.ts";
import { type ProjectDeck, resolveDeck } from "./resolve.ts";
import { logicalSize } from "./size.ts";
import { formatClock } from "./timing.ts";

export async function renderDeckHtml(
  dir: string,
  options: {
    mode?: PageMode;
    inlineAssets?: boolean;
    live?: boolean;
    includeNotes?: boolean;
    wsToken?: string;
    playerScript: string;
    liveReloadScript?: string;
  },
): Promise<string> {
  const { project, deck } = resolveDeck(dir);
  const live = options.live ?? false;
  return renderDeckDocument(deck, {
    mode: options.mode ?? "player",
    inlineAssets: options.inlineAssets ?? false,
    live,
    includeNotes: options.includeNotes,
    config: loadConfig(project.configPath),
    playerScript: options.playerScript,
    ...(options.liveReloadScript ? { liveReloadScript: options.liveReloadScript } : {}),
    ...(options.wsToken ? { wsToken: options.wsToken } : {}),
  });
}

export async function renderDeckDocument(
  deck: ProjectDeck,
  options: {
    mode: PageMode;
    inlineAssets: boolean;
    live?: boolean;
    includeNotes?: boolean;
    wsToken?: string;
    config: DekConfig;
    playerScript: string;
    liveReloadScript?: string;
  },
): Promise<string> {
  const includeNotes = options.mode === "video" ? false : options.includeNotes !== false;
  const data = presenterSlides(deck, options.config).map((slide) =>
    includeNotes ? slide : { ...slide, script: "" },
  );
  const slidesHtml = collectSlidesHtml(deck, {
    inline: options.inlineAssets,
    requireAll: !options.live,
  });
  const themeCss = readTheme(deck.dir, options.inlineAssets && !options.live);
  const state = data[0] ? presenterState(data, { slideIndex: 0, beatIndex: 0 }) : undefined;
  const budget = data[0]?.budgetSeconds !== undefined ? formatClock(data[0].budgetSeconds) : "";
  const size = logicalSize(deck.deck.ratio);
  const presenter = includeNotes
    ? `<aside id="dek-presenter"${options.mode === "presenter" ? "" : " hidden"}>
    <p id="dek-next">${escapeHtml(state?.next?.title ?? "")}</p>
    <ol id="dek-beats">
      ${(state?.current.beats ?? [])
        .map((beat, index) => `<li data-beat-index="${index}">${escapeHtml(beat.title)}</li>`)
        .join("")}
    </ol>
    <pre id="dek-script">${escapeHtml(state?.script ?? "")}</pre>
    <p id="dek-elapsed">0:00</p>
    <p id="dek-budget">${budget}</p>
  </aside>`
    : "";

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(deck.deck.title)}</title>
  <style>${playerChromeCss({ presenter: includeNotes, ...size })}</style>
  <style data-dek-theme>${themeCss}</style>
</head>
<body data-mode="${options.mode}"${includeNotes ? ` data-presenter="dek-presenter"` : ""}${options.live ? ` data-live="true"` : ""}${options.wsToken ? ` data-ws-token="${escapeAttr(options.wsToken)}"` : ""}>
  <div id="deck">${slidesHtml}</div>
  ${presenter}
  <script type="application/json" id="dek-data">${jsonForScript(data)}</script>
  <script>${options.playerScript}</script>
  ${options.live && options.liveReloadScript ? `<script>${options.liveReloadScript}</script>` : ""}
</body>
</html>
`;
}

function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
