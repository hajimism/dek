/// <reference lib="dom" />
import { PAGE_ID } from "../core/page.ts";
import type { PresenterSlide } from "../core/presenter-state.ts";
import {
  formatNotes,
  type Note,
  type NoteTarget,
  readNotes,
  reanchor,
  sortNotes,
  writeNotes,
} from "./annotate-notes.ts";
import {
  candidatesAt,
  currentStop,
  describeElement,
  SOURCE_ATTR,
  slideBox,
  slidePoint,
  windowPoint,
} from "./annotate-pick.ts";
import { placePopup } from "./annotate-place.ts";
import { slideSelector } from "./live.ts";
import { isLetterKey, isTextEntry } from "./step.ts";

type Point = { x: number; y: number };

/** One element picked for the note being written, and where the click that picked it was. */
type Pick = { el: Element; at: Point };

// In English whatever the deck's language, like the notes the view hands over.
const LABELS = {
  placeholder: "What should change?",
  add: "Add",
  save: "Save",
  cancel: "Cancel",
  delete: "Delete",
  copy: "Copy",
  clear: "Clear all notes",
  undo: "Undo",
  cleared: (n: number) => `Cleared ${n} ${n === 1 ? "note" : "notes"}`,
  close: "Leave annotate mode (a)",
  near: "near",
  addHint: "⌘/Ctrl-click adds more",
  notes: (n: number) => `${n} ${n === 1 ? "note" : "notes"}`,
  copied: (n: number) => `Copied ${n} ${n === 1 ? "note" : "notes"}`,
  manual: "Press ⌘C or Ctrl+C to copy",
};

/** Line icons, drawn in the text's color. */
const ICON = {
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/>',
  trash:
    '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
};

const icon = (name: keyof typeof ICON): string =>
  `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[name]}</svg>`;

// An inspector's look: dark panels, a hairline outline, and names in monospace, as the notes
// write them. Over the deck and everything the page draws; the popup and the bar on top.
const STYLE = `
:host { all: initial; --accent: #378add; --ink: #f4f4f5; --muted: #a1a1aa; --faint: #71717a; --panel: #18181b; --raised: #27272a; --well: #09090b; --line: rgb(255 255 255 / 0.1); }
[hidden] { display: none !important; }
* { box-sizing: border-box; margin: 0; font: 12px/1.45 system-ui, -apple-system, sans-serif; }
.mono, .mono *, kbd { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; }
svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; flex: none; }
button { display: inline-flex; align-items: center; gap: 6px; padding: 4px 8px; border: 0; border-radius: 6px; background: none; color: var(--muted); cursor: pointer; }
button:hover { background: var(--raised); color: var(--ink); }
button:disabled { opacity: 0.35; cursor: default; background: none; }
kbd { padding: 0 4px; border: 1px solid var(--line); border-radius: 4px; color: var(--faint); }
[data-part=layer] { position: fixed; z-index: 2147483000; cursor: crosshair; }
[data-part=hover], [data-part=pick] { position: fixed; z-index: 2147483001; pointer-events: none; outline: 1.5px solid var(--accent); outline-offset: 1px; border-radius: 2px; }
[data-part=pick] { background: rgb(55 138 221 / 0.12); }
[data-part=hover] span { position: absolute; left: -2px; bottom: 100%; margin-bottom: 5px; padding: 2px 6px; border-radius: 4px; background: #0c447c; color: #e6f1fb; white-space: nowrap; }
[data-part=hover] i { font-style: normal; color: #85b7eb; }
[data-part=marker] { position: fixed; z-index: 2147483002; min-width: 24px; height: 24px; padding: 0 6px; justify-content: center; transform: translate(-2px, calc(-100% + 2px)); border: 2px solid #fff; border-radius: 12px 12px 12px 2px; background: var(--accent); color: #fff; font-weight: 600; font-size: 11px; box-shadow: 0 2px 6px rgb(0 0 0 / 0.25); }
[data-part=marker]:hover { background: #185fa5; color: #fff; }
[data-part=popup], [data-part=pill], [data-part=tray] { background: var(--panel); color: var(--ink); border: 1px solid var(--line); box-shadow: 0 12px 32px rgb(0 0 0 / 0.35); }
[data-part=popup] { position: fixed; z-index: 2147483003; width: 340px; padding: 10px; border-radius: 12px; }
[data-part=choices] { display: grid; gap: 4px; margin-bottom: 8px; }
[data-part=path], [data-part=near] { display: flex; flex-wrap: wrap; align-items: center; gap: 2px; }
[data-part=path] > span, [data-part=near] > span { color: #52525b; }
[data-part=choices] button { padding: 2px 6px; border-radius: 5px; }
[data-part=choices] button[aria-pressed=true] { background: var(--raised); color: var(--ink); box-shadow: inset 0 0 0 1px var(--accent); }
[data-part=picked] { list-style: none; padding: 0 2px; margin-bottom: 8px; color: var(--faint); }
[data-part=picked] li { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
textarea { display: block; width: 100%; min-height: 3.6em; padding: 7px 9px; border: 1px solid var(--line); border-radius: 8px; background: var(--well); color: var(--ink); resize: vertical; outline: none; }
textarea:focus { border-color: var(--accent); }
textarea::placeholder { color: var(--faint); }
[data-part=actions] { display: flex; align-items: center; gap: 4px; margin-top: 8px; }
[data-part=hint] { margin-right: auto; padding-left: 2px; color: var(--faint); }
[data-part=delete] { margin-right: auto; color: #f09595; }
[data-part=popup] { transition: opacity 120ms; }
[data-part=popup][data-through] { opacity: 0.3; pointer-events: none; }
[data-part=add] { background: var(--raised); color: var(--ink); }
[data-part=add]:hover { background: #3f3f46; }
[data-part=bar] { position: fixed; z-index: 2147483003; display: grid; justify-items: center; gap: 8px; transform: translate(-50%, -100%); }
[data-part=pill] { display: flex; align-items: center; gap: 2px; padding: 4px; border-radius: 999px; }
[data-part=pill] button { border-radius: 999px; padding: 5px 10px; }
[data-part=pill] button[data-part=clear], [data-part=pill] button[data-part=close] { padding: 5px 7px; }
[data-part=count] { padding: 0 10px; color: var(--muted); white-space: nowrap; }
[data-part=clear]:hover { color: #f09595; }
[data-part=divider] { width: 1px; height: 16px; margin: 0 6px; background: var(--line); }
[data-part=copy] { background: var(--raised); color: var(--ink); }
[data-part=tray] { display: grid; gap: 6px; max-width: calc(100vw - 32px); padding: 8px; border-radius: 12px; }
[data-part=manual] { width: min(460px, calc(100vw - 48px)); min-height: 9em; resize: vertical; }
[data-part=report] { display: flex; align-items: center; gap: 8px; padding: 0 4px; }
[data-part=status] { color: var(--muted); }
[data-part=undo] { margin-left: auto; padding: 3px 10px; color: var(--ink); background: var(--raised); }
`;

/**
 * Annotate mode: point at elements of the slide on screen, write what should change, and copy
 * the notes as one block for an agent, each element named by the file and line it is written
 * at. It runs only on the dev server's pages for the speaker, beside the player, and shows
 * nothing until `a` or the presenter bar's button turns it on: the page may be on the projector.
 */
export function createAnnotateView(options: { deck: string; slides: PresenterSlide[] }): void {
  const { deck, slides } = options;
  const deckEl = document.getElementById(PAGE_ID.deck);
  const stageEl = document.getElementById(PAGE_ID.currentStage);
  if (!deckEl || !stageEl) {
    return;
  }
  const storageKey = `dek-annotate:${deck}`;
  const toggleEl = document.getElementById(PAGE_ID.annotateToggle);

  const host = document.createElement("div");
  host.id = "dek-annotate";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `<style>${STYLE}</style>
<div data-part="layer" hidden></div>
<div data-part="hover" class="mono" hidden></div>
<div data-part="picks"></div>
<div data-part="markers"></div>
<form data-part="popup" hidden>
  <div data-part="choices" class="mono">
    <nav data-part="path" aria-label="Elements under the click"></nav>
    <div data-part="near" aria-label="Elements near the click"></div>
  </div>
  <ul data-part="picked" class="mono"></ul>
  <textarea placeholder="${LABELS.placeholder}" aria-label="${LABELS.placeholder}"></textarea>
  <div data-part="actions">
    <span data-part="hint" class="mono">${LABELS.addHint}</span>
    <button type="button" data-part="delete">${LABELS.delete}</button>
    <button type="button" data-part="cancel">${LABELS.cancel} <kbd>esc</kbd></button>
    <button type="submit" data-part="add"><span>${LABELS.add}</span> <kbd>↵</kbd></button>
  </div>
</form>
<div data-part="bar" hidden>
  <div data-part="tray" hidden>
    <textarea data-part="manual" class="mono" readonly hidden></textarea>
    <div data-part="report">
      <p data-part="status" role="status"></p>
      <button type="button" data-part="undo" hidden>${LABELS.undo}</button>
    </div>
  </div>
  <div data-part="pill">
    <button type="button" data-part="copy">${icon("copy")}${LABELS.copy}</button>
    <span data-part="count"></span>
    <button type="button" data-part="clear" aria-label="${LABELS.clear}" title="${LABELS.clear}">${icon("trash")}</button>
    <span data-part="divider" aria-hidden="true"></span>
    <button type="button" data-part="close" aria-label="${LABELS.close}" title="${LABELS.close}">${icon("close")}</button>
  </div>
</div>`;
  document.body.append(host);

  const part = <T extends HTMLElement = HTMLElement>(name: string): T =>
    root.querySelector(`[data-part=${name}]`) as T;
  const layer = part("layer");
  const hover = part("hover");
  const popup = part<HTMLFormElement>("popup");
  const field = popup.querySelector("textarea") as HTMLTextAreaElement;
  const manual = part<HTMLTextAreaElement>("manual");
  const status = part("status");
  const tray = part("tray");

  /**
   * Say above the bar how Copy or Clear went: with the text to copy by hand when Copy could not,
   * and with Undo after Clear. Clear is undone rather than confirmed, and only until something
   * else is said here, a note is written, or the mode is left.
   */
  function report(text: string, extra: { byHand?: string; undo?: Note[] } = {}): void {
    status.textContent = text;
    manual.hidden = extra.byHand === undefined;
    manual.value = extra.byHand ?? "";
    cleared = extra.undo;
    part("undo").hidden = cleared === undefined;
    tray.hidden = text === "";
  }
  const hitStyle = document.createElement("style");
  // A decorative arrow often takes no pointer; while annotating, every element of the deck does.
  // The rail's copies carry the attribute too, so the rule stays inside the deck.
  hitStyle.textContent = `#${PAGE_ID.deck} [${SOURCE_ATTR}] { pointer-events: auto !important; }`;

  let on = false;
  let notes = load();
  /** What the last Clear took away, while Undo can still bring it back. */
  let cleared: Note[] | undefined;
  let picks: Pick[] = [];
  let choiceButtons = new Map<Element, HTMLButtonElement>();
  let editing: Note | undefined;
  let hovered: Element | undefined;
  let frame: number | undefined;
  // Hit testing tries dozens of points; the pointer is followed at most once a frame.
  let hoverTested = false;
  let hoverPending: Point | undefined;

  function load(): Note[] {
    try {
      return readNotes(sessionStorage.getItem(storageKey));
    } catch {
      return [];
    }
  }

  function save(): void {
    try {
      sessionStorage.setItem(storageKey, writeNotes(notes));
    } catch {
      // Storage blocked: the notes last as long as the page.
    }
  }

  /** The slide on screen, its beat, and its section in the deck. */
  function onScreen(): { slug: string; step: string; slide: Element | null } {
    const stop = currentStop(location.hash, slides);
    const slug = slides[stop.slideIndex]?.slug ?? "";
    return { slug, step: stop.step, slide: document.querySelector(slideSelector(slug)) };
  }

  function setOn(next: boolean): void {
    on = next;
    toggleEl?.setAttribute("aria-pressed", String(on));
    layer.hidden = !on;
    part("bar").hidden = !on;
    report("");
    if (on) {
      document.head.append(hitStyle);
      tick();
    } else {
      hitStyle.remove();
      closePopup();
      hovered = undefined;
      if (frame !== undefined) {
        cancelAnimationFrame(frame);
        frame = undefined;
      }
    }
    rebuild();
  }

  /** Follow what moves on the slide while the mode is on: entrances, morphs, a resized window. */
  function tick(): void {
    hoverTested = false;
    if (hoverPending) {
      hoverAt(hoverPending);
    }
    layout();
    frame = requestAnimationFrame(tick);
  }

  function hoverAt(at: Point): void {
    hoverTested = true;
    hoverPending = undefined;
    const [first] = candidates(at);
    if (first !== hovered) {
      hovered = first;
      rebuild();
    }
  }

  function elementsAt(x: number, y: number): Element[] {
    return document.elementsFromPoint(x, y);
  }

  function candidates(at: Point): Element[] {
    const { slide } = onScreen();
    return slide ? candidatesAt(at, slide, elementsAt) : [];
  }

  /** An element as a note names it: its name, its text, and its line, as Copy writes them. */
  function label(target: { name: string; text: string; source: string }): string {
    const text = target.text === "" ? "" : ` ${JSON.stringify(target.text)}`;
    return `${target.name}${text} :${target.source.split(":")[0]}`;
  }

  function describe(el: Element): { name: string; text: string; source: string } {
    return describeElement(el, el.closest(".slide") ?? el);
  }

  function place(
    el: HTMLElement,
    rect: { left: number; top: number; width: number; height: number },
  ): void {
    el.style.left = `${rect.left}px`;
    el.style.top = `${rect.top}px`;
    el.style.width = `${rect.width}px`;
    el.style.height = `${rect.height}px`;
  }

  /** Put every outline and marker where its element is now. */
  function layout(): void {
    if (!on) {
      return;
    }
    const stage = stageEl?.getBoundingClientRect() ?? new DOMRect();
    place(layer, stage);
    // The bar sits at the foot of the slide, whatever the rail or the presenter view take.
    const bar = part("bar");
    bar.style.left = `${stage.left + stage.width / 2}px`;
    bar.style.top = `${stage.bottom - 12}px`;
    hover.hidden = !hovered;
    if (hovered) {
      place(hover, hovered.getBoundingClientRect());
    }
    const outlines = part("picks").children;
    picks.forEach((pick, index) => {
      const outline = outlines[index];
      if (outline instanceof HTMLElement) {
        place(outline, pick.el.getBoundingClientRect());
      }
    });
    for (const marker of part("markers").querySelectorAll<HTMLElement>("[data-part=marker]")) {
      const tip = pinAt(notes[Number(marker.dataset.note)]);
      marker.hidden = !tip;
      if (tip) {
        marker.style.left = `${tip.x}px`;
        marker.style.top = `${tip.y}px`;
      }
    }
  }

  /**
   * Where a note's pin points: the top right corner of its first element, or the place clicked
   * when the note is about a place on the slide rather than an element.
   */
  function pinAt(note: Note | undefined): Point | undefined {
    const anchor = anchorOf(note);
    const point = note?.targets[0]?.point;
    if (!anchor) {
      return undefined;
    }
    if (point && anchor.matches(".slide")) {
      return windowPoint(point, deckEl as HTMLElement);
    }
    const rect = anchor.getBoundingClientRect();
    return { x: rect.right, y: rect.top };
  }

  /** The element a note's marker sits on: its first element, on the slide on screen. */
  function anchorOf(note: Note | undefined): Element | null {
    const { slug, slide } = onScreen();
    const first = note?.targets[0];
    if (!note || note.stale || note.slug !== slug || !first || !slide) {
      return null;
    }
    return slide.getAttribute(SOURCE_ATTR) === first.source
      ? slide
      : slide.querySelector(`[${SOURCE_ATTR}="${first.source}"]`);
  }

  /** Redraw what the state is made of: the count, the picks, the choices, and the markers. */
  function rebuild(): void {
    part("count").textContent = LABELS.notes(notes.length);
    part<HTMLButtonElement>("copy").disabled = notes.length === 0;
    part<HTMLButtonElement>("clear").disabled = notes.length === 0;
    part("picks").replaceChildren(
      ...picks.map(() => {
        const outline = document.createElement("div");
        outline.dataset.part = "pick";
        return outline;
      }),
    );
    const last = picks.at(-1)?.el;
    for (const [el, button] of choiceButtons) {
      button.setAttribute("aria-pressed", String(el === last));
    }
    const picked = editing ? editing.targets : picks.map((pick) => describe(pick.el));
    part("picked").replaceChildren(
      ...picked.map((target) => {
        const item = document.createElement("li");
        item.textContent = label(target);
        return item;
      }),
    );
    // Numbered as Copy numbers them, so a marker and its note in the chat say the same number.
    const markers = on
      ? sortNotes(slides, notes).flatMap((note, index) => {
          if (!anchorOf(note)) {
            return [];
          }
          const marker = document.createElement("button");
          marker.type = "button";
          marker.dataset.part = "marker";
          marker.dataset.note = String(notes.indexOf(note));
          marker.textContent = String(index + 1);
          marker.addEventListener("click", () => edit(note));
          return [marker];
        })
      : [];
    part("markers").replaceChildren(...markers);
    hover.replaceChildren();
    if (hovered) {
      // Its name, its size on the slide, and its line, as a browser's inspector shows them.
      const { name, source } = describe(hovered);
      const { width, height } = slideBox(hovered, deckEl as HTMLElement);
      const tag = document.createElement("span");
      const size = document.createElement("i");
      size.textContent = `${width}×${height}`;
      tag.append(`${name} `, size, ` :${source.split(":")[0]}`);
      hover.append(tag);
    }
    layout();
  }

  function openPopup(): void {
    popup.hidden = false;
    part("delete").hidden = editing === undefined;
    part("hint").hidden = editing !== undefined;
    (part("add").firstElementChild as HTMLElement).textContent = editing ? LABELS.save : LABELS.add;
    placeOpenPopup();
    field.focus();
  }

  /** Put the popup beside what the note is about, so it never hides what is pointed at. */
  function placeOpenPopup(): void {
    const rects = editing
      ? [anchorOf(editing)?.getBoundingClientRect()].filter((rect) => rect !== undefined)
      : picks.map((pick) => pick.el.getBoundingClientRect());
    if (rects.length === 0) {
      return;
    }
    const picked = {
      left: Math.min(...rects.map((rect) => rect.left)),
      top: Math.min(...rects.map((rect) => rect.top)),
      right: Math.max(...rects.map((rect) => rect.right)),
      bottom: Math.max(...rects.map((rect) => rect.bottom)),
    };
    const { width, height } = popup.getBoundingClientRect();
    const at = placePopup(picked, { width, height }, { width: innerWidth, height: innerHeight });
    popup.style.left = `${at.left}px`;
    popup.style.top = `${at.top}px`;
  }

  function closePopup(): void {
    popup.hidden = true;
    picks = [];
    showChoices([]);
    editing = undefined;
    field.value = "";
    rebuild();
  }

  /**
   * Offer the elements under a click: the one it hit and what that is inside, as a path from the
   * slide in, and apart from it whatever else is under or near the click. None once put away.
   */
  function showChoices(found: Element[]): void {
    const [first] = found;
    const path: Element[] = [];
    for (let el: Element | null = first ?? null; el; el = el.parentElement) {
      if (found.includes(el)) {
        path.unshift(el);
      }
    }
    const near = found.filter((el) => !path.includes(el));
    choiceButtons = new Map();
    const chips = (elements: Element[], between: string): Node[] =>
      elements.flatMap((el, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = describe(el).name;
        button.title = label(describe(el));
        button.addEventListener("click", () => choose(el));
        choiceButtons.set(el, button);
        return index === 0 ? [button] : [separator(between), button];
      });
    // A path reads from the slide in; what is near is only a list.
    part("path").replaceChildren(...chips(path, "›"));
    part("near").replaceChildren(
      ...(near.length > 0 ? [separator(LABELS.near), ...chips(near, "·")] : []),
    );
    part("near").hidden = near.length === 0;
  }

  function separator(text: string): HTMLElement {
    const span = document.createElement("span");
    span.textContent = text;
    span.setAttribute("aria-hidden", "true");
    return span;
  }

  /** Make `el`, one of the elements under the last click, the one that click picked. */
  function choose(el: Element): void {
    const last = picks.at(-1);
    if (last) {
      picks = [...picks.slice(0, -1), { el, at: last.at }];
    }
    rebuild();
    placeOpenPopup();
    field.focus();
  }

  function pickAt(at: Point, adding: boolean): void {
    const found = candidates(at);
    const [first] = found;
    if (!first) {
      return;
    }
    if (editing) {
      closePopup();
    }
    if (adding && !popup.hidden) {
      const already = picks.some((pick) => pick.el === first);
      picks = already ? picks.filter((pick) => pick.el !== first) : [...picks, { el: first, at }];
      if (picks.length === 0) {
        closePopup();
        return;
      }
    } else {
      picks = [{ el: first, at }];
    }
    showChoices(found);
    rebuild();
    openPopup();
  }

  function edit(note: Note): void {
    closePopup();
    editing = note;
    field.value = note.text;
    openPopup();
  }

  function snapshot(pick: Pick, slide: Element): NoteTarget {
    const box = slideBox(pick.el, deckEl as HTMLElement);
    const target: NoteTarget = { ...describeElement(pick.el, slide), box };
    return pick.el === slide
      ? { ...target, point: slidePoint(pick.at, deckEl as HTMLElement) }
      : target;
  }

  function submit(): void {
    const text = field.value;
    if (editing) {
      const target = editing;
      notes = notes.map((note) => (note === target ? { ...note, text } : note));
    } else {
      const { slug, step, slide } = onScreen();
      if (!slide || picks.length === 0) {
        return;
      }
      notes = [...notes, { slug, step, targets: picks.map((pick) => snapshot(pick, slide)), text }];
    }
    if (cleared) {
      report("");
    }
    save();
    closePopup();
  }

  function remove(): void {
    const target = editing;
    notes = notes.filter((note) => note !== target);
    save();
    closePopup();
  }

  async function copy(): Promise<void> {
    const text = formatNotes(deck, slides, notes);
    try {
      // Missing on a page served over plain HTTP, such as the LAN address.
      if (!navigator.clipboard) {
        throw new Error("no clipboard");
      }
      await navigator.clipboard.writeText(text);
      report(LABELS.copied(notes.length));
    } catch {
      report(LABELS.manual, { byHand: text });
      manual.focus();
      manual.select();
    }
  }

  /**
   * Match the notes on a slide an edit replaced to its elements as they are now; a note that
   * cannot be matched keeps what it said, marked as written before the edit.
   */
  function follow(slug: string): void {
    const slide = document.querySelector(slideSelector(slug));
    if (!slide) {
      return;
    }
    const present = [slide, ...slide.querySelectorAll(`[${SOURCE_ATTR}]`)].map((el) =>
      describeElement(el, slide),
    );
    notes = notes.map((note) => {
      if (note.slug !== slug) {
        return note;
      }
      const found = note.targets.map((target) => reanchor(target, present));
      if (found.some((el) => el === undefined)) {
        return { ...note, stale: true };
      }
      const { stale: _, ...rest } = note;
      return {
        ...rest,
        targets: note.targets.map((target, index) => ({ ...target, ...found[index] })),
      };
    });
    save();
    rebuild();
  }

  // Holding Cmd or Ctrl to add an element lets clicks through the popup, which may lie over it.
  // Heard on the way down, before a field of the view keeps its keys to itself.
  const through = (event: KeyboardEvent): void => {
    if (event.key === "Meta" || event.key === "Control") {
      popup.toggleAttribute("data-through", event.type === "keydown");
    }
  };
  addEventListener("keydown", through, true);
  addEventListener("keyup", through, true);
  addEventListener("blur", () => popup.removeAttribute("data-through"));

  // The player hears every key too; `a` and Escape are not among its own.
  document.addEventListener("keydown", (event) => {
    if (isTextEntry(event.target)) {
      return;
    }
    if (isLetterKey(event, "a")) {
      event.preventDefault();
      setOn(!on);
    } else if (event.key === "Escape" && on) {
      event.preventDefault();
      if (popup.hidden) {
        setOn(false);
      } else {
        closePopup();
      }
    }
  });
  // Keys typed into the note are the note's: the player hears a key from inside this view as
  // one on the view's host, which is not a text field, and would move the deck on a space.
  root.addEventListener("keydown", (event) => {
    if (!(event instanceof KeyboardEvent) || !isTextEntry(event.target)) {
      return;
    }
    event.stopPropagation();
    if (event.target !== field) {
      return;
    }
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      submit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      closePopup();
    }
  });
  popup.addEventListener("submit", (event) => {
    event.preventDefault();
    submit();
  });
  layer.addEventListener("pointermove", (event) => {
    const at = { x: event.clientX, y: event.clientY };
    if (hoverTested) {
      hoverPending = at;
    } else {
      hoverAt(at);
    }
  });
  layer.addEventListener("pointerleave", () => {
    hoverPending = undefined;
    hovered = undefined;
    rebuild();
  });
  layer.addEventListener("click", (event) => {
    pickAt({ x: event.clientX, y: event.clientY }, event.metaKey || event.ctrlKey);
  });
  const act = (name: string, fn: () => void): void => {
    part(name).addEventListener("click", (event) => {
      // A button left focused would take the next space, which the deck is for.
      (event.currentTarget as HTMLElement).blur();
      fn();
    });
  };
  act("cancel", closePopup);
  act("delete", remove);
  act("copy", () => void copy());
  act("clear", () => {
    const gone = notes;
    notes = [];
    save();
    rebuild();
    report(LABELS.cleared(gone.length), { undo: gone });
  });
  act("undo", () => {
    notes = cleared ?? notes;
    save();
    rebuild();
    report("");
  });
  act("close", () => setOn(false));
  toggleEl?.addEventListener("click", () => setOn(!on));
  addEventListener("hashchange", () => {
    if (!popup.hidden && !editing) {
      closePopup();
    }
    rebuild();
  });
  // A live update replaces a slide's section whole; its notes are matched to the new one.
  new MutationObserver((records) => {
    const slugs = new Set(
      records.flatMap((record) =>
        [...record.addedNodes].flatMap((node) =>
          node instanceof Element && node.matches(".slide")
            ? [node.getAttribute("data-slug") ?? ""]
            : [],
        ),
      ),
    );
    // What was picked for the note being written went with the old section.
    if (picks.some((pick) => !pick.el.isConnected)) {
      closePopup();
    }
    for (const slug of slugs) {
      follow(slug);
    }
  }).observe(deckEl, { childList: true });
  for (const slug of new Set(notes.map((note) => note.slug))) {
    follow(slug);
  }
  rebuild();
}
