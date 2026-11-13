// The talk page's side of the embed protocol: it listens to the deck in the iframe, and only to
// that deck (its origin and its window), and steers it once the deck has said it is ready. A deck
// that never says so is shown as it is: nothing here then sends it anything. The deck runs its
// author's code, so what it says is believed only as far as the page asked for it: a pick only
// while picking, on a slide the talk has; a mark only for a comment the page shows.

import { DEFAULT_SIZE, EARLY_KEY, type EarlyMessage, readDeckMessage } from "./embed.ts";
import type { Mark, PageMessage, PickedElement, Position, ReadySlide, Size } from "./type.ts";

export type DeckEvents = {
  onpicked?: (picked: { slug: string; step: string; target: PickedElement }) => void;
  onpickcancel?: () => void;
  onmark?: (id: string) => void;
  /** A key the deck passed on, pressed while it had the focus (ADR 57). */
  onkey?: (key: "c") => void;
};

export type DeckLinkOptions = {
  /** The deck's own origin, the only one heard. */
  origin: string;
  /** The talk's slides; a move, pick or mark naming any other slug is not heard. */
  slugs: readonly string[];
  /** Whether this person may read the comments; without it nothing is marked. */
  canRead: boolean;
  /** Whether this person may comment; without it nothing is picked. */
  canComment: boolean;
  /** Whether a comment with this ID is on the page. */
  hasComment?: (id: string) => boolean;
  events?: DeckEvents;
};

export class DeckLink {
  ready = $state(false);
  size: Size = $state(DEFAULT_SIZE);
  slides: ReadySlide[] = $state([]);
  current: Position | null = $state(null);
  picking = $state(false);

  #frame: HTMLIFrameElement | null = null;
  #origin: string;
  #slugs: Set<string>;
  #canRead: boolean;
  #canComment: boolean;
  #hasComment: (id: string) => boolean;
  #events: DeckEvents;

  constructor(options: DeckLinkOptions) {
    this.#origin = options.origin;
    this.#slugs = new Set(options.slugs);
    this.#canRead = options.canRead;
    this.#canComment = options.canComment;
    this.#hasComment = options.hasComment ?? (() => false);
    this.#events = options.events ?? {};
  }

  /** Start listening; returns the function that stops. */
  attach(frame: HTMLIFrameElement): () => void {
    this.#frame = frame;
    const onMessage = (event: MessageEvent) => this.#receive(event);
    window.addEventListener("message", onMessage);
    // A server-rendered iframe may say it is ready before this page's script runs; the page's
    // head keeps what it said (EARLY_LISTENER), and it is read here as if it had just arrived.
    const holder = window as unknown as { [EARLY_KEY]?: EarlyMessage[] | null };
    const early = holder[EARLY_KEY] ?? [];
    // From here the page listens itself; the head script stops keeping messages.
    holder[EARLY_KEY] = null;
    for (const message of early) {
      this.#receive({
        origin: message.origin,
        source: message.source,
        data: message.data,
      } as MessageEvent);
    }
    return () => {
      window.removeEventListener("message", onMessage);
      this.#frame = null;
    };
  }

  #receive(event: MessageEvent): void {
    if (
      event.origin !== this.#origin ||
      !this.#frame ||
      event.source !== this.#frame.contentWindow
    ) {
      return;
    }
    const message = readDeckMessage(event.data);
    if (!message) {
      return;
    }
    switch (message.type) {
      case "dek:ready":
        this.ready = true;
        this.size = message.size;
        this.slides = message.slides;
        this.current = message.current;
        break;
      case "dek:moved":
        if (this.#slugs.has(message.slug)) {
          this.current = { slug: message.slug, step: message.step, index: message.index };
        }
        break;
      case "dek:picked":
        // A pick nobody asked for, or of a slide the talk lacks, is not a comment's target.
        if (!this.picking || !this.#slugs.has(message.slug)) {
          return;
        }
        this.pick(false);
        this.#events.onpicked?.({ slug: message.slug, step: message.step, target: message.target });
        break;
      case "dek:pick-cancel":
        if (this.picking) {
          this.picking = false;
          this.#events.onpickcancel?.();
        }
        break;
      case "dek:mark":
        if (this.#canRead && this.#hasComment(message.id)) {
          this.#events.onmark?.(message.id);
        }
        break;
      case "dek:key":
        this.#events.onkey?.(message.key);
        break;
    }
  }

  #send(message: PageMessage): void {
    if (!this.ready) {
      return;
    }
    this.#frame?.contentWindow?.postMessage(message, this.#origin);
  }

  goto(slug: string, step?: string): void {
    this.#send(step === undefined ? { type: "dek:goto", slug } : { type: "dek:goto", slug, step });
  }

  step(by: 1 | -1): void {
    if (!this.current) {
      return;
    }
    const next = this.slides[this.current.index + by];
    if (next) {
      this.goto(next.slug);
    }
  }

  pick(on: boolean): void {
    if (!this.#canComment) {
      return;
    }
    this.picking = on && this.ready;
    this.#send({ type: "dek:pick", on });
  }

  marks(marks: Mark[]): void {
    if (!this.#canRead) {
      return;
    }
    this.#send({ type: "dek:marks", marks: $state.snapshot(marks) });
  }
}
