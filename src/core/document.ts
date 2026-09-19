import { playerChromeCss } from "./chrome.ts";
import { type DekConfig, loadConfig } from "./config.ts";
import { escapeAttr, escapeHtml } from "./escape.ts";
import { collectSlidesHtml, htmlShell, type PageMode, readTheme } from "./html.ts";
import { nextPresenterTitle, presenterSlides, presenterState } from "./presenter.ts";
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
  const presenterOpen = options.mode === "presenter";
  const hidden = presenterOpen ? "" : " hidden";
  const nextTitle = state ? nextPresenterTitle(state) : "";
  const atEnd = Boolean(state) && nextTitle === "" && !state?.next;
  const page = data.length > 0 ? `1 <span class="dek-page-total">/ ${data.length}</span>` : "";
  const progress = includeNotes ? `<div id="dek-progress"${hidden}></div>` : "";
  const presenter = includeNotes
    ? `<aside id="dek-presenter"${hidden}>
    <section id="dek-next-panel">
      <div class="dek-panel-label">Next</div>
      <div class="dek-next-body">
        <div id="dek-next-stage"></div>
        <p id="dek-next-end"${atEnd ? "" : " hidden"}>End</p>
      </div>
      <p id="dek-next">${escapeHtml(nextTitle)}</p>
    </section>
    <section id="dek-notes-panel">
      <ol id="dek-beats">
      ${(state?.current.beats ?? [])
        .map((beat, index) => `<li data-beat-index="${index}">${escapeHtml(beat.title)}</li>`)
        .join("")}
    </ol>
      <pre id="dek-script">${escapeHtml(state?.script ?? "")}</pre>
    </section>
    <footer id="dek-presenter-bar">
      <span id="dek-page">${page}</span>
      <p id="dek-elapsed">0:00</p>
      <p id="dek-budget">${budget}</p>
    </footer>
  </aside>`
    : "";
  const currentLabel = includeNotes ? `<div class="dek-panel-label">Current</div>` : "";
  const rail = options.mode === "video" ? "" : renderRailHtml(data);
  const railResize = rail
    ? `<div id="dek-rail-resize" role="separator" aria-orientation="vertical" aria-label="Resize slide list" tabindex="0"></div>`
    : "";

  return htmlShell({
    lang: deck.deck.lang,
    title: deck.deck.title,
    head: `<style>${playerChromeCss({ presenter: includeNotes, ...size })}</style>
  <style data-dek-theme>${themeCss}</style>`,
    bodyAttrs: `${presenterOpen ? ' class="is-presenter"' : ""} data-mode="${options.mode}"${includeNotes ? ` data-presenter="dek-presenter"` : ""}${options.live ? ` data-live="true"` : ""}${options.wsToken ? ` data-ws-token="${escapeAttr(options.wsToken)}"` : ""}`,
    body: `${progress}
  <div id="dek-shell">
    ${rail}
    <section id="dek-current">
      ${currentLabel}
      <div id="dek-current-stage"><div id="deck">${slidesHtml}</div></div>
    </section>
    ${presenter}
  </div>
  ${railResize}
  <script type="application/json" id="dek-data">${jsonForScript(data)}</script>
  <script>${options.playerScript}</script>
  ${options.live && options.liveReloadScript ? `<script>${options.liveReloadScript}</script>` : ""}`,
  });
}

export function renderRailHtml(slides: Array<{ slug: string; title: string }>): string {
  const items = slides
    .map((slide, index) => {
      const n = index + 1;
      const label = `${n}. ${slide.title}`;
      return `<a class="dek-thumb" href="#${escapeAttr(slide.slug)}" data-slide-index="${index}" aria-label="${escapeAttr(label)}"><span class="dek-thumb-num">${n}</span><span class="dek-thumb-frame"></span></a>`;
    })
    .join("");
  return `<nav id="dek-rail" aria-label="Slides">${items}</nav>`;
}

function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
