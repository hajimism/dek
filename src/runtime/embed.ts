/// <reference lib="dom" />
// The embed API (ADR 45): what a page that frames the deck can ask of it through `postMessage`,
// and what the deck tells that page. It runs only in a deck that is framed, and only listens to
// the page that frames it. Nothing it sends holds the script, the notes, or speaker data.

import { cutText } from "../core/annotation-rows.ts";
import {
  EMBED_KEYS,
  type EmbedMark,
  type EmbedMessage,
  type EmbedMover,
  type EmbedRequest,
  embedStop,
  gotoPosition,
  movedMessage,
  pickedMessage,
  readEmbedRequest,
  readyMessage,
} from "../core/embed-protocol.ts";
import { PAGE_ID } from "../core/page.ts";
import { positionsEqual } from "../core/position.ts";
import type { BeatRef, Position } from "../core/step.ts";
import { RUNTIME_CLASSES } from "../core/theme-facts.ts";
import { candidatesAt, elementName, slideBox, visibleText, windowPoint } from "./annotate-pick.ts";
import { slideSelector } from "./live.ts";
import { isLetterKey, isTextEntry } from "./step.ts";

export type Embed = {
  /** The player has mounted, standing at `pos`. */
  ready(pos: Position): void;
  /** The deck moved from `from` to `to`, at the framing page's asking or the reader's. */
  moved(from: Position, to: Position, by: EmbedMover): void;
  /** Put the outline and the pins where their elements and boxes are now. */
  layout(): void;
};

/** The page that frames the deck, as far as the embed API talks to it. */
type Parent = Pick<Window, "postMessage">;

// dek's inspector blue, as annotate mode's markers are: the theme's own accent may be any colour,
// as light as the slide behind it.
const STYLE = `
:host { all: initial; --accent: #378add; }
[hidden] { display: none !important; }
[data-part=layer] { position: fixed; z-index: 2147483000; cursor: crosshair; }
[data-part=hover] { position: fixed; z-index: 2147483001; pointer-events: none; outline: 1.5px solid var(--accent); outline-offset: 1px; border-radius: 2px; background: rgb(55 138 221 / 0.08); }
[data-part=pin] { position: fixed; z-index: 2147483002; box-sizing: border-box; min-width: 22px; height: 22px; padding: 0 5px; transform: translate(-50%, -50%); border: 2px solid #fff; border-radius: 11px; background: var(--accent); color: #fff; font: 600 11px/18px system-ui, -apple-system, sans-serif; text-align: center; box-shadow: 0 2px 6px rgb(0 0 0 / 0.25); cursor: pointer; }
[data-part=pin]:hover { background: #185fa5; }
`;

/**
 * Start the embed API on a framed deck. `go` moves the deck as a key press does; `position` is
 * where it stands. The parent's messages are read only when they come from `parent` itself.
 */
export function createEmbed(options: {
  deck: string;
  /** The slide's own size, as the build stamped it: the pixels every box is in. */
  size: { width: number; height: number };
  slides: ReadonlyArray<{ slug: string; beats: BeatRef[] }>;
  parent: Parent;
  position: () => Position;
  go: (next: Position) => void;
}): Embed {
  const { slides, parent } = options;
  const deckEl = document.getElementById(PAGE_ID.deck);
  const stageEl = document.getElementById(PAGE_ID.currentStage);
  const classes = classesAsBuilt(deckEl);

  const host = document.createElement("div");
  host.id = "dek-embed";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `<style>${STYLE}</style>
<div data-part="layer" hidden></div>
<div data-part="hover" hidden></div>
<div data-part="pins"></div>`;
  document.body.append(host);
  const part = (name: string): HTMLElement =>
    root.querySelector(`[data-part=${name}]`) as HTMLElement;
  const layer = part("layer");
  const hover = part("hover");
  const pins = part("pins");

  const hitStyle = document.createElement("style");
  // A decorative shape often takes no pointer; while picking, every element of the slides does.
  hitStyle.textContent = `#${PAGE_ID.deck} .slide, #${PAGE_ID.deck} .slide * { pointer-events: auto !important; }`;

  let picking = false;
  let hovered: Element | undefined;
  let marks = new Map<string, EmbedMark>();

  function post(message: EmbedMessage): void {
    // Nothing a message holds is secret, so it may go to whichever page frames the deck.
    parent.postMessage(message, "*");
  }

  function onScreen(): { slug: string; step: string; slide: Element | null } {
    const stop = embedStop(slides, options.position());
    return { ...stop, slide: document.querySelector(slideSelector(stop.slug)) };
  }

  function pickable(at: { x: number; y: number }): Element | undefined {
    const { slide } = onScreen();
    return slide
      ? candidatesAt(
          at,
          slide,
          (x, y) => document.elementsFromPoint(x, y),
          () => true,
        )[0]
      : undefined;
  }

  function setPicking(on: boolean): void {
    picking = on;
    layer.hidden = !on;
    hovered = undefined;
    if (on) {
      document.head.append(hitStyle);
    } else {
      hitStyle.remove();
    }
    layout();
  }

  function pick(el: Element): void {
    const { slug, step, slide } = onScreen();
    if (!slide || !deckEl) {
      return;
    }
    // Named as annotate mode names it; the slide's own text is the whole slide, which names nothing.
    const name = elementName(el, classes(el));
    const text = el === slide ? "" : cutText(visibleText(el, slide));
    post(pickedMessage({ slug, step }, { name, text, box: slideBox(el, deckEl) }));
  }

  /** A pin for each mark on the slide on screen, numbered as the framing page numbers them. */
  function drawPins(): void {
    const { slug } = onScreen();
    pins.replaceChildren(
      ...[...marks.values()]
        .filter((mark) => mark.slug === slug)
        .map((mark) => {
          const pin = document.createElement("button");
          pin.type = "button";
          pin.dataset.part = "pin";
          pin.dataset.mark = mark.id;
          pin.textContent = String(mark.number);
          pin.setAttribute("aria-label", `Comment ${mark.number}`);
          pin.addEventListener("click", () => post({ type: "dek:mark", id: mark.id }));
          return pin;
        }),
    );
    layout();
  }

  function layout(): void {
    if (picking) {
      place(layer, stageEl?.getBoundingClientRect() ?? viewport());
    }
    hover.hidden = !hovered;
    if (hovered) {
      place(hover, hovered.getBoundingClientRect());
    }
    for (const pin of pins.children) {
      const mark = marks.get((pin as HTMLElement).dataset.mark ?? "");
      if (pin instanceof HTMLElement && mark && deckEl) {
        // On the top right corner of the box, as annotate mode pins a note.
        const at = windowPoint({ x: mark.box.x + mark.box.width, y: mark.box.y }, deckEl);
        pin.style.left = `${at.x}px`;
        pin.style.top = `${at.y}px`;
      }
    }
  }

  function handle(request: EmbedRequest): void {
    switch (request.type) {
      case "dek:goto": {
        const next = gotoPosition(slides, request.slug, request.step);
        if (next) {
          options.go(next);
        }
        return;
      }
      case "dek:current":
        post(movedMessage(slides, options.position(), "embed"));
        return;
      case "dek:pick":
        setPicking(request.on);
        return;
      case "dek:marks":
        marks = new Map(request.marks.map((mark) => [mark.id, mark]));
        drawPins();
        return;
    }
  }

  window.addEventListener("message", (event: MessageEvent) => {
    if (event.source !== parent) {
      return;
    }
    const request = readEmbedRequest(event.data);
    if (request) {
      handle(request);
    }
  });
  layer.addEventListener("pointermove", (event) => {
    hovered = pickable({ x: event.clientX, y: event.clientY });
    layout();
  });
  layer.addEventListener("pointerleave", () => {
    hovered = undefined;
    layout();
  });
  layer.addEventListener("click", (event) => {
    const el = pickable({ x: event.clientX, y: event.clientY });
    if (el) {
      pick(el);
    }
  });
  document.addEventListener("keydown", (event) => {
    // Escape typed into a field on a slide is the field's.
    if (picking && event.key === "Escape" && !isTextEntry(event.target)) {
      event.preventDefault();
      setPicking(false);
      post({ type: "dek:pick-cancel" });
    }
  });
  // The keys the page may want, last of all: on the window, after the player's and a plugin's
  // listeners on the document, so a key one of them took (and prevented) stays theirs.
  window.addEventListener("keydown", (event) => {
    if (event.defaultPrevented || isTextEntry(event.target)) {
      return;
    }
    const key = EMBED_KEYS.find((letter) => isLetterKey(event, letter));
    if (key) {
      post({ type: "dek:key", key });
    }
  });

  return {
    ready(pos) {
      post(readyMessage({ name: options.deck, size: options.size }, slides, pos));
    },
    moved(from, to, by) {
      if (positionsEqual(from, to)) {
        return;
      }
      hovered = undefined;
      post(movedMessage(slides, to, by));
      if (from.slideIndex !== to.slideIndex) {
        drawPins();
      } else {
        layout();
      }
    },
    layout,
  };
}

/**
 * An element's classes as the build wrote them: what it had before the player or a slide script
 * set any, less the state classes the player sets. A name built from them is one an author finds
 * in `slides/<slug>.html`. An element a script made later has only the classes it has now.
 */
function classesAsBuilt(deckEl: HTMLElement | null): (el: Element) => string[] {
  const own = (el: Element): string[] =>
    [...el.classList].filter((name) => !RUNTIME_CLASSES.has(name));
  const built = new WeakMap<Element, string[]>();
  for (const el of deckEl?.querySelectorAll(".slide, .slide *") ?? []) {
    built.set(el, own(el));
  }
  return (el) => built.get(el) ?? own(el);
}

function viewport(): DOMRect {
  return new DOMRect(0, 0, window.innerWidth, window.innerHeight);
}

function place(
  el: HTMLElement,
  rect: { left: number; top: number; width: number; height: number },
) {
  el.style.left = `${rect.left}px`;
  el.style.top = `${rect.top}px`;
  el.style.width = `${rect.width}px`;
  el.style.height = `${rect.height}px`;
}
