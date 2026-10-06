import { readTheme } from "./assets.ts";
import { playerChromeCss } from "./chrome.ts";
import { escapeAttr, escapeHtml } from "./escape.ts";
import { collectSlidesHtml, htmlShell } from "./html.ts";
import { type OgpImage, ogpHead } from "./ogp.ts";
import { PAGE_ID, type PageMode, pageConfigAttrs } from "./page.ts";
import {
  nextPresenterTitle,
  presenterSlides,
  presenterState,
  type ScriptReader,
} from "./presenter.ts";
import { RAIL_WIDTH_DEFAULT, RAIL_WIDTH_MAX, RAIL_WIDTH_MIN } from "./rail-width.ts";
import { type ProjectDeck, resolveDeck } from "./resolve.ts";
import { logicalSize } from "./size.ts";
import { readSlideScripts, slideScriptTags } from "./slide-script.ts";
import { formatClock } from "./timing.ts";

/** Who the page is for; each decides what else the page carries. */
export type PageTarget =
  /** The dev server's page: assets by URL, live reload, and the presenter's notes when allowed. */
  | {
      kind: "dev";
      mode: "player" | "presenter";
      includeNotes: boolean;
      liveReloadScript: string;
      /** Annotate mode, run after the player on a page that is the speaker's: one with the notes. */
      annotateScript: string;
      /**
       * What a presenter page sends as `?token=` on its live channels at `/decks/<name>/events`
       * and `/decks/<name>/ws`: neither an EventSource nor a WebSocket can set a header of its
       * own. An audience page never carries one.
       */
      liveToken?: string;
    }
  /** `dekc build`: one file that stands alone, shared as a link. */
  | {
      kind: "build";
      /** Built with `--public`, for anyone who has the link rather than the speaker. */
      public?: boolean;
      /** The built page's absolute URL, for og:url. */
      publicUrl?: string;
      /** The first slide's picture, for og:image. */
      previewImage?: OgpImage;
    }
  /** `dekc video`: one file that stands alone, every slide and nothing around them. */
  | { kind: "video" };

/** The deck at `dir`, rendered for `target`. */
export function renderDeckHtml(
  dir: string,
  options: { playerScript: string; target: PageTarget },
): string {
  return renderDeckDocument(resolveDeck(dir).deck, options);
}

export function renderDeckDocument(
  deck: ProjectDeck,
  options: { playerScript: string; target: PageTarget },
): string {
  const { target } = options;
  const mode: PageMode =
    target.kind === "dev" ? target.mode : target.kind === "build" ? "player" : "video";
  const live = target.kind === "dev";
  // A file that stands alone carries its assets and a minified theme; the dev server serves
  // assets by URL. A build skips a broken slide script, as the dev server does, since lint never
  // stops a build and its findings name the script. A video has no findings to carry the news, and
  // hours of rendering would show slides without their motion, so a broken script stops it.
  const standalone = !live;
  const strictScripts = target.kind === "video";
  const includeNotes = target.kind === "dev" ? target.includeNotes : target.kind === "build";
  const data = presenterSlides(deck, scriptReader(target)).map((slide) =>
    includeNotes ? slide : { ...slide, script: "" },
  );
  const slidesHtml = collectSlidesHtml(deck, { inline: standalone, sources: live });
  const themeCss = readTheme(deck.dir, standalone);
  const slideScripts = readSlideScripts(deck.dir, { strict: strictScripts });
  const state = data[0] ? presenterState(data, { slideIndex: 0, beatIndex: 0 }) : undefined;
  const budget = data[0]?.budgetSeconds !== undefined ? formatClock(data[0].budgetSeconds) : "";
  const size = logicalSize(deck.deck.ratio);
  const presenterOpen = mode === "presenter";
  const hidden = presenterOpen ? "" : " hidden";
  const nextTitle = state ? nextPresenterTitle(state) : "";
  const atEnd = Boolean(state) && nextTitle === "" && !state?.next;
  const page = data.length > 0 ? `1 <span class="dek-page-total">/ ${data.length}</span>` : "";
  const progress = includeNotes ? `<div id="${PAGE_ID.progress}"${hidden}></div>` : "";
  const presenter = includeNotes
    ? `<aside id="${PAGE_ID.presenter}"${hidden}>
    <section id="${PAGE_ID.nextPanel}">
      <div class="dek-panel-label">Next</div>
      <div class="dek-next-body">
        <div id="${PAGE_ID.nextStage}"></div>
        <p id="${PAGE_ID.nextEnd}"${atEnd ? "" : " hidden"}>End</p>
      </div>
      <p id="${PAGE_ID.next}">${escapeHtml(nextTitle)}</p>
    </section>
    <section id="${PAGE_ID.notesPanel}">
      <ol id="${PAGE_ID.beats}">
      ${(state?.current.beats ?? [])
        .map((beat, index) => `<li data-beat-index="${index + 1}">${escapeHtml(beat.title)}</li>`)
        .join("")}
    </ol>
      <pre id="${PAGE_ID.script}">${escapeHtml(state?.script ?? "")}</pre>
    </section>
    <footer id="${PAGE_ID.presenterBar}">
      <span id="${PAGE_ID.page}">${page}</span>
      <p id="${PAGE_ID.elapsed}">0:00</p>
      <p id="${PAGE_ID.budget}">${budget}</p>
      ${target.kind === "dev" ? markButton(deck.deck.lang) : ""}
      ${target.kind === "dev" ? annotateButton(deck.deck.lang) : ""}
      <button id="${PAGE_ID.laserToggle}" type="button" aria-pressed="false" aria-label="${escapeAttr(laserLabel(deck.deck.lang))}" title="${escapeAttr(laserLabel(deck.deck.lang))}"></button>
    </footer>
  </aside>`
    : "";
  const currentLabel = includeNotes ? `<div class="dek-panel-label">Current</div>` : "";
  const rail = target.kind === "video" ? "" : renderRailHtml(data);
  const hint = target.kind === "build" ? renderKeyHintHtml(deck.deck.lang) : "";
  const railResize = rail
    ? `<div id="${PAGE_ID.railResize}" role="separator" aria-orientation="vertical" aria-label="Resize slide list" aria-valuemin="${RAIL_WIDTH_MIN}" aria-valuemax="${RAIL_WIDTH_MAX}" aria-valuenow="${RAIL_WIDTH_DEFAULT}" tabindex="0"></div>`
    : "";

  const ogp =
    target.kind === "build"
      ? `${ogpHead({
          title: deck.deck.title,
          description: deck.deck.description,
          event: deck.deck.event,
          date: deck.deck.date,
          lang: deck.deck.lang,
          url: target.publicUrl,
          image: target.previewImage,
        })}
  `
      : "";
  const liveToken = target.kind === "dev" ? target.liveToken : undefined;

  return htmlShell({
    lang: deck.deck.lang,
    title: deck.deck.title,
    head: `${ogp}<style>${playerChromeCss({ presenter: includeNotes, ...size })}</style>
  <style data-dek-theme>${themeCss}</style>`,
    bodyAttrs: `${presenterOpen ? ' class="is-presenter"' : ""}${pageConfigAttrs({
      mode,
      deck: deck.name,
      live,
      ...(liveToken ? { liveToken } : {}),
    })}`,
    body: `${progress}
  <div id="${PAGE_ID.shell}">
    ${rail}
    <main id="${PAGE_ID.current}">
      ${currentLabel}
      <div id="${PAGE_ID.currentStage}"><div id="${PAGE_ID.deck}">${slidesHtml}</div></div>
    </main>
    ${presenter}
  </div>
  ${railResize}
  ${hint}
  <div id="${PAGE_ID.announce}" aria-live="polite"></div>
  <script type="application/json" id="${PAGE_ID.data}">${jsonForScript(data)}</script>
  ${slideScriptTags(slideScripts)}
  <script>${options.playerScript}</script>
  ${target.kind === "dev" ? `<script>${target.liveReloadScript}</script>` : ""}
  ${target.kind === "dev" && includeNotes ? `<script>${target.annotateScript}</script>` : ""}`,
  });
}

/**
 * A page built with `--public` is for anyone who has the link, so it carries the script as the
 * audience may read it; any other page is the speaker's own. A URL alone says where the page is
 * served, not who reads it: the speaker may present from that very page.
 */
function scriptReader(target: PageTarget): ScriptReader {
  return target.kind === "build" && target.public === true ? "audience" : "speaker";
}

export function renderRailHtml(slides: Array<{ slug: string; title: string }>): string {
  const items = slides
    .map((slide, index) => {
      const n = index + 1;
      const label = `${n}. ${slide.title}`;
      return `<a class="dek-thumb" href="#${escapeAttr(slide.slug)}" data-slide-index="${index}" aria-label="${escapeAttr(label)}"><span class="dek-thumb-num">${n}</span><span class="dek-thumb-frame"></span></a>`;
    })
    .join("");
  return `<nav id="${PAGE_ID.rail}" aria-label="Slides">${items}</nav>`;
}

const KEY_HINT_LABELS = {
  ja: { rail: "スライド一覧", presenter: "発表者ビュー" },
  en: { rail: "Slide rail", presenter: "Presenter view" },
};

/**
 * The button that marks the beat on screen to rewrite. Only the dev server's page has it: the
 * marks go to a file of the project's, and a built file has no server to keep them.
 */
function markButton(lang: string): string {
  const label = lang.toLowerCase().startsWith("ja")
    ? "このビートに直す印を付ける (m)"
    : "Mark this beat to rewrite (m)";
  return `<button id="${PAGE_ID.markToggle}" type="button" aria-pressed="false" aria-label="${escapeAttr(label)}" title="${escapeAttr(label)}"></button>`;
}

/**
 * The button that turns annotate mode on and off. Only the dev server's page has it: the notes
 * name files and lines of a project on this machine, and a built file is someone else's to read.
 */
function annotateButton(lang: string): string {
  const label = lang.toLowerCase().startsWith("ja")
    ? "スライドの要素に注釈を付ける (a)"
    : "Annotate slide elements (a)";
  return `<button id="${PAGE_ID.annotateToggle}" type="button" aria-pressed="false" aria-label="${escapeAttr(label)}" title="${escapeAttr(label)}"></button>`;
}

/** The laser button's name, with the key that does the same. */
function laserLabel(lang: string): string {
  return lang.toLowerCase().startsWith("ja") ? "レーザーポインター (l)" : "Laser pointer (l)";
}

/**
 * The keys a viewer of a built file cannot discover by looking: `s` and `p`. Shown once as
 * the file opens, it fades on its own and goes away at the first key or move.
 */
function renderKeyHintHtml(lang: string): string {
  const labels = lang.toLowerCase().startsWith("ja") ? KEY_HINT_LABELS.ja : KEY_HINT_LABELS.en;
  return `<div id="${PAGE_ID.hint}" role="status"><span><kbd>s</kbd>${labels.rail}</span><span><kbd>p</kbd>${labels.presenter}</span></div>`;
}

function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
