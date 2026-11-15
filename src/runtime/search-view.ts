/// <reference lib="dom" />

import { PAGE_ID } from "../core/page.ts";
import type { PresenterSlide } from "../core/presenter-state.ts";
import { type Position, resolveStep } from "../core/step.ts";
import { excerpt, findMatches, type SearchHit, type SearchSource, searchDeck } from "./search.ts";

/** The search across the deck's slides, opened with `/`. */
export type SearchView = {
  /** Open the search, or bring the field back to hand if it is open; false where it cannot. */
  open: () => boolean;
  /** The deck stands at `pos`: a highlight left on a slide the deck has left goes. */
  render: (pos: Position) => void;
};

/** The name the slide's highlighted matches go by, which the player's chrome colours. */
const SEARCH_HIGHLIGHT = "dek-search";

const LABELS = {
  en: {
    search: "Search slides",
    close: "Close",
    none: "No slide says that",
    script: "Script",
    found: (n: number) => (n === 1 ? "1 slide" : `${n} slides`),
  },
  ja: {
    search: "スライドを検索",
    close: "閉じる",
    none: "見つかりません",
    script: "台本",
    found: (n: number) => `${n} 枚`,
  },
};

// The view's own look, kept from the theme's rules by its shadow root.
const STYLE = `:host { all: initial; position: fixed; inset: 0; z-index: 2147482000; font: 14px/1.45 system-ui, sans-serif; color: #eee; }
:host([hidden]) { display: none; }
[data-part="backdrop"] { position: absolute; inset: 0; background: rgba(0,0,0,0.45); }
[data-part="panel"] { position: absolute; top: 10vh; left: 50%; transform: translateX(-50%); width: min(640px, calc(100vw - 32px)); max-height: 76vh; display: flex; flex-direction: column; background: #141414; border: 1px solid rgba(255,255,255,0.14); border-radius: 12px; box-shadow: 0 16px 48px rgba(0,0,0,0.5); overflow: hidden; }
[data-part="bar"] { display: flex; align-items: center; gap: 8px; padding: 10px 10px 10px 16px; border-bottom: 1px solid rgba(255,255,255,0.1); }
input { flex: 1; min-width: 0; padding: 6px 0; border: 0; outline: none; background: transparent; color: #fff; font: 500 17px/1.4 system-ui, sans-serif; }
input::placeholder { color: rgba(255,255,255,0.4); }
button { flex: none; width: 28px; height: 28px; padding: 0; border: 0; border-radius: 6px; background: transparent; color: rgba(255,255,255,0.6); font: 18px/1 system-ui, sans-serif; cursor: pointer; }
button:hover, button:focus-visible { background: rgba(255,255,255,0.1); color: #fff; outline: none; }
[data-part="status"] { margin: 0; padding: 6px 16px; color: rgba(255,255,255,0.5); font-size: 12px; }
[data-part="status"]:empty { display: none; }
ol { margin: 0; padding: 0 6px 6px; list-style: none; overflow: auto; scrollbar-width: thin; }
ol:empty { display: none; }
li { display: grid; grid-template-columns: 2.25em minmax(0, 1fr) auto; column-gap: 8px; padding: 8px 10px; border-radius: 8px; cursor: pointer; }
li[aria-selected="true"] { background: rgba(58,185,213,0.18); box-shadow: inset 2px 0 0 #3ab9d5; }
li:hover:not([aria-selected="true"]) { background: rgba(255,255,255,0.06); }
.num { color: rgba(255,255,255,0.45); text-align: right; font-variant-numeric: tabular-nums; }
.title { font-weight: 600; color: #fff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.count { color: rgba(255,255,255,0.45); font-size: 12px; font-variant-numeric: tabular-nums; }
.quote { grid-column: 2 / 4; margin: 2px 0 0; color: rgba(255,255,255,0.7); font-size: 13px; overflow-wrap: anywhere; }
.kind { margin-right: 6px; padding: 0 5px; border: 1px solid rgba(255,255,255,0.25); border-radius: 4px; font-size: 11px; color: rgba(255,255,255,0.6); }
mark { background: rgba(58,185,213,0.35); color: #fff; border-radius: 2px; }`;

/** A slide's words, white space collapsed, each character with the beat it shows at and its node. */
type SlideWords = {
  text: string;
  beats: number[];
  chars: Array<{ node: Text; offset: number }>;
};

/** What a slide holds that is never shown. */
const UNSEEN = new Set(["SCRIPT", "STYLE", "TEMPLATE", "NOSCRIPT"]);

/** Elements that run on within a line; between any others, words are apart though no space is. */
const INLINE = new Set(
  "A ABBR B BDI BDO CITE CODE DATA DEL DFN EM I INS KBD MARK Q RP RT RUBY S SAMP SMALL SPAN STRONG SUB SUP TIME TSPAN U VAR WBR".split(
    " ",
  ),
);

/** The element `node`'s line runs in: its nearest ancestor that is not inline, or the slide. */
function blockOf(node: Node, slide: Element): Element {
  let el = node.parentElement ?? slide;
  while (el !== slide && INLINE.has(el.tagName.toUpperCase()) && el.parentElement) {
    el = el.parentElement;
  }
  return el;
}

/**
 * Read `slide`'s words, shown or not yet shown: a step to come counts at its beat. Its words
 * keep their nodes, so a match can be highlighted on the slide.
 */
function readSlide(slide: Element, beats: PresenterSlide["beats"]): SlideWords {
  const words: SlideWords = { text: "", beats: [], chars: [] };
  let space = false;
  let block: Element | undefined;
  const walker = document.createTreeWalker(slide, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const beat = beatOfNode(node, slide, beats);
    if (beat === undefined) {
      continue;
    }
    const at = blockOf(node, slide);
    if (block && at !== block) {
      space = words.text.length > 0;
    }
    block = at;
    for (let offset = 0; offset < node.data.length; offset += 1) {
      const char = node.data[offset] as string;
      if (/\s/.test(char)) {
        space = words.text.length > 0;
        continue;
      }
      if (space) {
        words.text += " ";
        words.beats.push(beat);
        words.chars.push({ node, offset });
        space = false;
      }
      words.text += char;
      words.beats.push(beat);
      words.chars.push({ node, offset });
    }
  }
  return words;
}

/** The beat by which `node` shows, the latest of its steps'; undefined for what never shows. */
function beatOfNode(
  node: Node,
  slide: Element,
  beats: PresenterSlide["beats"],
): number | undefined {
  let beat = 0;
  for (let el = node.parentElement; el && el !== slide; el = el.parentElement) {
    if (UNSEEN.has(el.tagName)) {
      return undefined;
    }
    const step = el.getAttribute("data-step");
    if (step !== null) {
      beat = Math.max(beat, resolveStep(beats, step) ?? 0);
    }
  }
  return beat;
}

/** `text` as nodes, with each place it says `query` marked. Never as HTML: it is the deck's. */
function marked(text: string, query: string): Node[] {
  const nodes: Node[] = [];
  let at = 0;
  for (const [start, end] of findMatches(text, query)) {
    nodes.push(document.createTextNode(text.slice(at, start)));
    const mark = document.createElement("mark");
    mark.textContent = text.slice(start, end);
    nodes.push(mark);
    at = end;
  }
  nodes.push(document.createTextNode(text.slice(at)));
  return nodes;
}

/**
 * The search, which a key on the page opens over the slides: it finds a word on any slide,
 * including steps not shown yet, in a slide's title, and in its script where the page carries
 * one, and goes to the beat that shows it.
 */
export function createSearchView(options: {
  slides: PresenterSlide[];
  go: (pos: Position) => void;
}): SearchView {
  const { slides, go } = options;
  const labels = document.documentElement.lang.toLowerCase().startsWith("ja")
    ? LABELS.ja
    : LABELS.en;

  const host = document.createElement("div");
  host.id = PAGE_ID.search;
  host.hidden = true;
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `<style>${STYLE}</style>
<div data-part="backdrop"></div>
<div data-part="panel" role="dialog" aria-label="${labels.search}">
  <div data-part="bar">
    <input type="text" role="combobox" aria-expanded="true" aria-controls="dek-search-results" aria-autocomplete="list" enterkeyhint="search" autocomplete="off" spellcheck="false" placeholder="${labels.search}" aria-label="${labels.search}">
    <button type="button" data-part="close" aria-label="${labels.close}" title="${labels.close}">×</button>
  </div>
  <p data-part="status" role="status"></p>
  <ol id="dek-search-results" role="listbox" aria-label="${labels.search}"></ol>
</div>`;
  document.body.append(host);

  const part = (name: string): HTMLElement =>
    root.querySelector(`[data-part=${name}]`) as HTMLElement;
  const field = root.querySelector("input") as HTMLInputElement;
  const list = root.querySelector("ol") as HTMLOListElement;
  const status = part("status");

  let words: Array<SlideWords | undefined> = [];
  let sources: SearchSource[] = [];
  let hits: SearchHit[] = [];
  let selected = 0;
  let returnFocus: Element | null = null;
  let highlighted: number | undefined;

  /** Read every slide afresh: a live update or a slide's script may have changed its words. */
  function index(): void {
    const els = new Map<string, Element>();
    for (const el of document.querySelectorAll(`#${PAGE_ID.deck} > .slide[data-slug]`)) {
      els.set(el.getAttribute("data-slug") ?? "", el);
    }
    words = slides.map((slide) => {
      const el = els.get(slide.slug);
      return el ? readSlide(el, slide.beats) : undefined;
    });
    sources = slides.flatMap((slide, slideIndex): SearchSource[] => {
      const read = words[slideIndex];
      const script = slide.script.replace(/\s+/g, " ").trim();
      return [
        { slideIndex, kind: "title", text: slide.title },
        ...(read
          ? [{ slideIndex, kind: "slide" as const, text: read.text, beats: read.beats }]
          : []),
        ...(script ? [{ slideIndex, kind: "script" as const, text: script }] : []),
      ];
    });
  }

  function row(hit: SearchHit, i: number, query: string): HTMLLIElement {
    const li = document.createElement("li");
    li.id = `dek-search-${i}`;
    li.setAttribute("role", "option");
    li.setAttribute("aria-selected", String(i === selected));
    const num = document.createElement("span");
    num.className = "num";
    num.textContent = String(hit.slideIndex + 1);
    const title = document.createElement("span");
    title.className = "title";
    title.append(...marked(slides[hit.slideIndex]?.title ?? "", query));
    const count = document.createElement("span");
    count.className = "count";
    count.textContent = hit.count > 1 ? `×${hit.count}` : "";
    li.append(num, title, count);
    if (hit.snippet) {
      const { text, start, end, kind } = hit.snippet;
      const cut = excerpt(text, start, end);
      const quote = document.createElement("p");
      quote.className = "quote";
      if (kind === "script") {
        const label = document.createElement("span");
        label.className = "kind";
        label.textContent = labels.script;
        quote.append(label);
      }
      const match = document.createElement("mark");
      match.textContent = cut.match;
      quote.append(cut.lead, match, cut.tail);
      li.append(quote);
    }
    li.addEventListener("click", () => choose(i));
    return li;
  }

  function update(): void {
    const query = field.value;
    hits = searchDeck(sources, query);
    selected = 0;
    list.replaceChildren(...hits.map((hit, i) => row(hit, i, query)));
    status.textContent = query.trim()
      ? hits.length
        ? labels.found(hits.length)
        : labels.none
      : "";
    select(0);
  }

  function select(i: number): void {
    if (hits.length === 0) {
      field.removeAttribute("aria-activedescendant");
      return;
    }
    selected = (i + hits.length) % hits.length;
    for (const [at, li] of [...list.children].entries()) {
      li.setAttribute("aria-selected", String(at === selected));
    }
    field.setAttribute("aria-activedescendant", `dek-search-${selected}`);
    list.children[selected]?.scrollIntoView?.({ block: "nearest" });
  }

  function choose(i: number): void {
    const hit = hits[i];
    if (!hit) {
      return;
    }
    const query = field.value;
    close();
    go({ slideIndex: hit.slideIndex, beatIndex: hit.beatIndex });
    highlight(hit.slideIndex, query);
  }

  /** Mark where the slide says `query`, where the browser can mark text without changing it. */
  function highlight(slideIndex: number, query: string): void {
    const read = words[slideIndex];
    if (!read || typeof Highlight !== "function" || !CSS.highlights) {
      return;
    }
    const ranges = findMatches(read.text, query).flatMap(([start, end]) => {
      const first = read.chars[start];
      const last = read.chars[end - 1];
      if (!first?.node.isConnected || !last?.node.isConnected) {
        return [];
      }
      const range = document.createRange();
      range.setStart(first.node, first.offset);
      range.setEnd(last.node, last.offset + 1);
      return [range];
    });
    CSS.highlights.set(SEARCH_HIGHLIGHT, new Highlight(...ranges));
    highlighted = slideIndex;
  }

  function clearHighlight(): void {
    if (highlighted !== undefined) {
      CSS.highlights?.delete(SEARCH_HIGHLIGHT);
      highlighted = undefined;
    }
  }

  function close(): void {
    host.hidden = true;
    if (returnFocus instanceof HTMLElement && returnFocus.isConnected) {
      returnFocus.focus({ preventScroll: true });
    } else {
      field.blur();
    }
  }

  field.addEventListener("input", update);
  part("close").addEventListener("click", close);
  part("backdrop").addEventListener("click", close);
  // The player hears a key from inside this view as one on its host, which is no text field:
  // a space typed here would move the deck, and a `c` reach the page that frames it.
  root.addEventListener("keydown", (event) => {
    if (!(event instanceof KeyboardEvent)) {
      return;
    }
    event.stopPropagation();
    // Safari sends the key that ends a conversion after compositionend; 229 marks it still.
    if (event.isComposing || event.keyCode === 229) {
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.target === field && event.key === "ArrowDown") {
      event.preventDefault();
      select(selected + 1);
    } else if (event.target === field && event.key === "ArrowUp") {
      event.preventDefault();
      select(selected - 1);
    } else if (event.target === field && event.key === "Enter") {
      event.preventDefault();
      choose(selected);
    }
  });

  return {
    open() {
      if (host.hidden) {
        returnFocus = document.activeElement;
        clearHighlight();
        index();
        host.hidden = false;
        update();
      }
      field.focus();
      field.select();
      return true;
    },
    render(pos) {
      if (highlighted !== undefined && pos.slideIndex !== highlighted) {
        clearHighlight();
      }
    },
  };
}
