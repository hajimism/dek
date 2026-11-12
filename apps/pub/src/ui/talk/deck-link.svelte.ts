// The talk page's side of the embed protocol: it listens to the deck in the iframe, and only to
// that deck (its origin and its window), and steers it once the deck has said it is ready. A deck
// that never says so is shown as it is: nothing here then sends it anything.

import {
  DEFAULT_SIZE,
  EARLY_KEY,
  type EarlyMessage,
  type Mark,
  type PageMessage,
  type PickedElement,
  type Position,
  type ReadySlide,
  readDeckMessage,
  type Size,
} from "../../lib/embed.ts";

export type DeckEvents = {
  onpicked?: (picked: { slug: string; step: string; target: PickedElement }) => void;
  onpickcancel?: () => void;
  onmark?: (id: string) => void;
};

export class DeckLink {
  ready = $state(false);
  size: Size = $state(DEFAULT_SIZE);
  slides: ReadySlide[] = $state([]);
  current: Position | null = $state(null);
  picking = $state(false);

  #frame: HTMLIFrameElement | null = null;
  #origin: string;
  #events: DeckEvents;

  constructor(origin: string, events: DeckEvents = {}) {
    this.#origin = origin;
    this.#events = events;
  }

  /** Start listening; returns the function that stops. */
  attach(frame: HTMLIFrameElement): () => void {
    this.#frame = frame;
    const onMessage = (event: MessageEvent) => this.#receive(event);
    window.addEventListener("message", onMessage);
    // A server-rendered iframe may say it is ready before this page's script runs; the page's
    // head keeps what it said (EARLY_LISTENER), and it is read here as if it had just arrived.
    const early = (window as unknown as { [EARLY_KEY]?: EarlyMessage[] })[EARLY_KEY] ?? [];
    for (const message of early.splice(0)) {
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
        this.current = { slug: message.slug, step: message.step, index: message.index };
        break;
      case "dek:picked":
        this.picking = false;
        this.#events.onpicked?.({ slug: message.slug, step: message.step, target: message.target });
        break;
      case "dek:pick-cancel":
        this.picking = false;
        this.#events.onpickcancel?.();
        break;
      case "dek:mark":
        this.#events.onmark?.(message.id);
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
    this.picking = on && this.ready;
    this.#send({ type: "dek:pick", on });
  }

  marks(marks: Mark[]): void {
    this.#send({ type: "dek:marks", marks: $state.snapshot(marks) });
  }
}
