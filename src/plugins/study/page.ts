/// <reference lib="dom" />
/**
 * dek-study's page (ADR 34): a sheet of stickers over the words in study.yaml. `r` lays the sheet
 * on and takes it off, and the page remembers which for the deck. The pointer on a sticker peels it
 * back, and the words show through. It finds each sticker's words as the check does, with
 * the same reader and the same placement, so a deck that passes lint is a deck the sheet covers.
 */
import type { DekPage, PageApi } from "../../plugin-api.ts";
import { STUDY_FILE } from "./manifest.ts";
import { normalize, placeStickers } from "./place.ts";
import { readStudy, type Sticker } from "./study.ts";

declare const dek: DekPage;

/** How long a sticker takes to fade away under the pointer, and to come back after it. */
const FADE_OUT_MS = 180;
const FADE_IN_MS = 120;
/** How long the sheet's state shows after `r`, before it gets out of the slide's way. */
const TOAST_MS = 1500;
/** How far a sticker reaches past its words, in ems of the words it hides: a little to each side, barely above and below. */
const PAD_X = 0.18;
const PAD_Y = 0.04;
const UNSEEN = new Set(["SCRIPT", "STYLE", "TEMPLATE", "NOSCRIPT"]);

/**
 * A sticker is a slip of pale yellow paper, as a sticky note is, with square corners and the same
 * on every theme, so it reads as something laid on the slide rather than part of it. Under the
 * pointer it fades away and leaves a yellow rule under the words, so the place still reads as a
 * sticker's; it comes back once the pointer leaves.
 */
const STYLE = `
  .sheet { position: absolute; inset: 0; }
  .sheet[hidden] { display: none; }
  .sticker {
    position: absolute;
    pointer-events: auto;
    background: rgb(255 240 160);
    box-shadow: inset 0 calc(-1 * max(2px, 0.08em)) 0 rgb(240 206 72);
    transition: background-color ${FADE_IN_MS}ms ease-in;
  }
  .sticker.peek {
    background: rgb(255 240 160 / 0);
    transition: background-color ${FADE_OUT_MS}ms ease-out;
  }
  @media (prefers-reduced-motion: reduce) {
    .sticker, .sticker.peek, .toast, .toast.show { transition: none; }
  }
  .toast {
    opacity: 0;
    visibility: hidden;
    transition: opacity ${FADE_OUT_MS}ms ease-in, visibility 0s ${FADE_OUT_MS}ms;
    position: absolute;
    top: 0;
    right: 0;
    padding: 6px 12px;
    background: var(--study-ink);
    color: var(--study-paper);
    font: 600 13px/1.4 system-ui, sans-serif;
    letter-spacing: 0.08em;
  }
  .toast.show {
    opacity: 1;
    visibility: visible;
    transition: opacity ${FADE_IN_MS}ms ease-out, visibility 0s;
  }
`;

dek.plugin("study", { api: 1 }, (api) => {
  const file = api.data(STUDY_FILE);
  const stickers = file ? readStudy(file.text).stickers : [];
  const bySlide = Map.groupBy(stickers, (sticker) => sticker.slide);
  const storage = `dek-study:${api.deck.name}:sheet`;
  let on = readOn(storage);
  const mounted = new Map<
    string,
    { root: HTMLElement; layer: ShadowRoot; sheet: HTMLElement; toast: HTMLElement }
  >();
  let toastTimer: ReturnType<typeof setTimeout> | undefined;

  api.on("mount", ({ slug, root, layer }) => {
    // The slide's own ink and paper, for the hairline and the notice, through the layer's host.
    const slideStyle = getComputedStyle(root);
    const host = layer.host as HTMLElement;
    host.style.setProperty("--study-ink", slideStyle.color);
    host.style.setProperty("--study-paper", paper(slideStyle.backgroundColor));
    const style = document.createElement("style");
    style.textContent = STYLE;
    const sheet = document.createElement("div");
    sheet.className = "sheet";
    const toast = document.createElement("div");
    toast.className = "toast";
    layer.append(style, sheet, toast);
    mounted.set(slug, { root, layer, sheet, toast });
  });
  api.on("change", ({ slug }) => draw(slug));
  api.key("r", () => {
    on = !on;
    writeOn(storage, on);
    const slug = api.current().slug;
    draw(slug);
    announce(slug);
  });
  // Text set in a web font moves once the font arrives.
  void document.fonts?.ready.then(() => draw(api.current().slug));

  /** Says for a moment whether the sheet is on. */
  function announce(slug: string): void {
    const toast = mounted.get(slug)?.toast;
    if (!toast) {
      return;
    }
    toast.textContent = on ? "SHEET ON" : "SHEET OFF";
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove("show");
    }, TOAST_MS);
  }

  function draw(slug: string): void {
    const view = mounted.get(slug);
    if (!view) {
      return;
    }
    const { root, layer, sheet } = view;
    sheet.replaceChildren();
    sheet.hidden = !on;
    if (!on) {
      return;
    }
    const onSlide = bySlide.get(slug) ?? [];

    const host = layer.host as HTMLElement;
    const box = host.getBoundingClientRect();
    const scale = host.offsetWidth > 0 ? box.width / host.offsetWidth : 1;
    const words = readWords(root);
    for (const { sticker, at } of placeStickers(words.text, onSlide).placed) {
      const range = words.range(at, normalize(sticker.quote).length);
      if (!range || !shown(api, range)) {
        continue;
      }
      const ink = getComputedStyle(range.startContainer.parentElement ?? root);
      const em = Number.parseFloat(ink.fontSize) || 16;
      const pieces = lines(range.getClientRects()).map((rect) =>
        stickerEl(sticker, ink, {
          left: (rect.left - box.left) / scale - em * PAD_X,
          top: (rect.top - box.top) / scale - em * PAD_Y,
          width: (rect.right - rect.left) / scale + em * PAD_X * 2,
          height: (rect.bottom - rect.top) / scale + em * PAD_Y * 2,
        }),
      );
      peekTogether(pieces);
      sheet.append(...pieces);
    }
  }
});

type Box = { left: number; top: number; right: number; bottom: number };

/**
 * The words' boxes, one per line: a range across elements, such as `<strong>外部</strong>視点`,
 * gives a box for each, and one sticker over the words reads as one.
 */
function lines(rects: DOMRectList): Box[] {
  const merged: Box[] = [];
  const sorted = [...rects]
    .filter((rect) => rect.width > 0 && rect.height > 0)
    .sort((a, b) => a.top - b.top || a.left - b.left);
  for (const rect of sorted) {
    const last = merged.at(-1);
    const sameLine = last && rect.top < last.bottom && rect.bottom > last.top;
    if (last && sameLine && rect.left <= last.right + 1) {
      last.left = Math.min(last.left, rect.left);
      last.top = Math.min(last.top, rect.top);
      last.right = Math.max(last.right, rect.right);
      last.bottom = Math.max(last.bottom, rect.bottom);
    } else {
      merged.push({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom });
    }
  }
  return merged;
}

/** A sticker in the color and size of the words under it, so its ems are theirs. */
function stickerEl(
  sticker: Sticker,
  ink: CSSStyleDeclaration,
  box: { left: number; top: number; width: number; height: number },
): HTMLElement {
  const el = document.createElement("div");
  el.className = "sticker";
  el.dataset.id = sticker.id;
  el.style.cssText = `left:${box.left}px;top:${box.top}px;width:${box.width}px;height:${box.height}px;font-size:${ink.fontSize}`;
  return el;
}

/** The slide's background, or white where the slide leaves it transparent. */
function paper(background: string): string {
  return background === "" || background === "transparent" || /rgba\(.*,\s*0\)$/.test(background)
    ? "#fff"
    : background;
}

/** A sticker that wraps onto two lines is one sticker: the pointer on either piece peels both. */
function peekTogether(pieces: HTMLElement[]): void {
  const peek = (on: boolean) => {
    for (const piece of pieces) {
      piece.classList.toggle("peek", on);
    }
  };
  for (const piece of pieces) {
    piece.addEventListener("pointerenter", () => peek(true));
    piece.addEventListener("pointerleave", () => peek(false));
  }
}

/** A sticker covers words only once they show: one over a beat still to come would give it away. */
function shown(api: PageApi, range: Range): boolean {
  const start = range.startContainer.parentElement;
  const end = range.endContainer.parentElement;
  return (!start || api.shown(start)) && (!end || api.shown(end));
}

/**
 * The slide's words as the check reads them, whitespace collapsed, and a way back from a place in
 * them to the DOM: each character kept remembers the text node and offset it came from.
 */
function readWords(root: HTMLElement): {
  text: string;
  range: (at: number, length: number) => Range | undefined;
} {
  const chars: Array<{ node: Text; offset: number }> = [];
  let text = "";
  let space = false;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      unseen(node, root) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  });
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const data = node.data;
    for (let offset = 0; offset < data.length; offset += 1) {
      const char = data[offset] as string;
      if (/\s/.test(char)) {
        space = text.length > 0;
        continue;
      }
      if (space) {
        text += " ";
        chars.push({ node, offset });
        space = false;
      }
      text += char;
      chars.push({ node, offset });
    }
  }
  return {
    text,
    range(at, length) {
      const first = chars[at];
      const last = chars[at + length - 1];
      if (!first || !last) {
        return undefined;
      }
      const range = document.createRange();
      range.setStart(first.node, first.offset);
      range.setEnd(last.node, last.offset + 1);
      return range;
    },
  };
}

function unseen(node: Node, root: HTMLElement): boolean {
  for (let el = node.parentElement; el && el !== root; el = el.parentElement) {
    if (UNSEEN.has(el.tagName)) {
      return true;
    }
  }
  return false;
}

function readOn(key: string): boolean {
  try {
    return localStorage.getItem(key) === "on";
  } catch {
    return false;
  }
}

function writeOn(key: string, on: boolean): void {
  try {
    localStorage.setItem(key, on ? "on" : "off");
  } catch {
    // A page whose storage is blocked forgets; the sheet still works for the visit.
  }
}
