import { afterEach, describe, expect, it, vi } from "vitest";
import { DeckLink } from "../../src/model/deck/feature/talk/deck-link.svelte.ts";

const ORIGIN = "http://d-abc.localhost:5176";
const ready = {
  type: "dek:ready",
  protocol: 1,
  deck: "talk",
  size: { width: 1024, height: 768 },
  slides: [
    { slug: "intro", steps: ["0"] },
    { slug: "end", steps: ["0"] },
  ],
  current: { slug: "intro", step: "0", index: 0 },
};
const picked = {
  type: "dek:picked",
  slug: "end",
  step: "0",
  target: {
    kind: "element",
    path: "slides/end.html",
    name: "h1",
    text: "End",
    box: { x: 1, y: 2, width: 3, height: 4 },
  },
};

let frames: HTMLIFrameElement[] = [];

function frame(): HTMLIFrameElement {
  const element = document.createElement("iframe");
  document.body.appendChild(element);
  frames.push(element);
  return element;
}

function say(from: HTMLIFrameElement | null, data: unknown, origin = ORIGIN) {
  window.dispatchEvent(
    new MessageEvent("message", { data, origin, source: from?.contentWindow ?? null }),
  );
}

function link(options: Partial<ConstructorParameters<typeof DeckLink>[0]> = {}) {
  return new DeckLink({ origin: ORIGIN, slugs: ["intro", "end"], canComment: true, ...options });
}

afterEach(() => {
  for (const element of frames) {
    element.remove();
  }
  frames = [];
  delete (window as unknown as Record<string, unknown>).__dekEarly;
});

describe("DeckLink", () => {
  it("hears only its own deck: the deck's origin, from the deck's window", () => {
    const deck = frame();
    const other = frame();
    const view = link();
    const stop = view.attach(deck);
    say(deck, ready, "http://evil.localhost");
    say(other, ready);
    say(null, ready);
    expect(view.ready).toBe(false);
    say(deck, ready);
    expect(view.ready).toBe(true);
    expect(view.size).toEqual({ width: 1024, height: 768 });
    stop();
  });

  it("reads the ready message the head kept from before it listened, then stops the keeping", () => {
    const deck = frame();
    (window as unknown as Record<string, unknown>).__dekEarly = [
      { origin: ORIGIN, source: deck.contentWindow, data: ready },
      {
        origin: "http://evil.localhost",
        source: deck.contentWindow,
        data: { ...ready, deck: "evil" },
      },
    ];
    const view = link();
    const stop = view.attach(deck);
    expect(view.ready).toBe(true);
    expect(view.current?.slug).toBe("intro");
    expect((window as unknown as Record<string, unknown>).__dekEarly).toBeNull();
    stop();
  });

  it("ignores a pick nobody asked for, and one on a slide the talk lacks", () => {
    const deck = frame();
    const onpicked = vi.fn();
    const view = link({ events: { onpicked } });
    const stop = view.attach(deck);
    say(deck, ready);
    say(deck, picked);
    expect(onpicked).not.toHaveBeenCalled();
    view.pick(true);
    say(deck, { ...picked, slug: "elsewhere" });
    expect(onpicked).not.toHaveBeenCalled();
    stop();
  });

  it("takes the pick it asked for once, and tells the deck to stop picking", () => {
    const deck = frame();
    const onpicked = vi.fn();
    const sent: unknown[] = [];
    const view = link({ events: { onpicked } });
    const stop = view.attach(deck);
    say(deck, ready);
    vi.spyOn(deck.contentWindow as Window, "postMessage").mockImplementation((message: unknown) => {
      sent.push(message);
    });
    view.pick(true);
    say(deck, picked);
    say(deck, picked);
    expect(onpicked).toHaveBeenCalledOnce();
    expect(onpicked.mock.calls[0]?.[0]).toMatchObject({ slug: "end", step: "0" });
    expect(view.picking).toBe(false);
    expect(sent).toEqual([
      { type: "dek:pick", on: true },
      { type: "dek:pick", on: false },
    ]);
    stop();
  });

  it("passes on a mark only for a comment the page has, and only to someone who may comment", () => {
    const deck = frame();
    const onmark = vi.fn();
    const view = link({ hasComment: (id) => id === "c_known", events: { onmark } });
    const stop = view.attach(deck);
    say(deck, ready);
    say(deck, { type: "dek:mark", id: "c_unknown" });
    say(deck, { type: "dek:mark", id: "c_known" });
    expect(onmark).toHaveBeenCalledExactlyOnceWith("c_known");
    stop();

    const reader = link({ canComment: false, hasComment: () => true, events: { onmark } });
    const stopReader = reader.attach(deck);
    say(deck, ready);
    say(deck, { type: "dek:mark", id: "c_known" });
    reader.pick(true);
    expect(reader.picking).toBe(false);
    expect(onmark).toHaveBeenCalledOnce();
    stopReader();
  });

  it("does not follow a move to a slide the talk lacks", () => {
    const deck = frame();
    const view = link();
    const stop = view.attach(deck);
    say(deck, ready);
    say(deck, { type: "dek:moved", slug: "elsewhere", step: "0", index: 5, by: "reader" });
    expect(view.current?.slug).toBe("intro");
    say(deck, { type: "dek:moved", slug: "end", step: "0", index: 1, by: "reader" });
    expect(view.current?.slug).toBe("end");
    stop();
  });
});
