import { describe, expect, test } from "bun:test";
import type { ProjectDeck } from "../../src/core/resolve.ts";
import { createRooms } from "../../src/server/rooms.ts";

/** A deck with these slides, each with this many beats; only what rooms read. */
function deck(name: string, slides: Record<string, number>): ProjectDeck {
  const sections = Object.entries(slides).map(([slug, beats]) => ({
    slug,
    beats: Array.from({ length: beats }, () => ({})),
  }));
  return { name, deck: { sections } } as unknown as ProjectDeck;
}

function client() {
  const got: unknown[] = [];
  return { got, send: (payload: string) => got.push(JSON.parse(payload)) };
}

describe("createRooms", () => {
  test("relays a move to the rest of the room, not back or to other decks", () => {
    const rooms = createRooms(() => [deck("a", { intro: 0, end: 0 }), deck("b", { intro: 0 })]);
    const [sender, receiver, other] = [client(), client(), client()];
    rooms.join("a", sender);
    rooms.join("a", receiver);
    rooms.join("b", other);
    rooms.move("a", sender, JSON.stringify({ slideIndex: 1, beatIndex: 0, extra: "x" }));
    expect(receiver.got).toEqual([{ slideIndex: 1, beatIndex: 0 }]);
    expect(sender.got).toEqual([]);
    expect(other.got).toEqual([]);
  });

  test("pins a move past the deck to its last beat once, and relays that", () => {
    const rooms = createRooms(() => [deck("a", { intro: 0, end: 2 })]);
    const [sender, receiver] = [client(), client()];
    rooms.join("a", sender);
    rooms.join("a", receiver);
    rooms.move("a", sender, JSON.stringify({ slideIndex: 7, beatIndex: 9 }));
    expect(receiver.got).toEqual([{ slideIndex: 1, beatIndex: 2 }]);
    expect(rooms.current("a")).toEqual({ slug: "end", slideIndex: 1, beatIndex: 2 });
  });

  test("goto moves everyone in the room and says where it stands", () => {
    const rooms = createRooms(() => [deck("a", { intro: 0, end: 2 })]);
    const viewer = client();
    rooms.join("a", viewer);
    expect(rooms.goto("a", "end")).toEqual({
      ok: true,
      at: { slug: "end", slideIndex: 1, beatIndex: 0 },
    });
    expect(viewer.got).toEqual([{ slideIndex: 1, beatIndex: 0 }]);
    expect(rooms.goto("a", "nope")).toEqual({ ok: false, message: 'section "nope" not found' });
    expect(rooms.goto("z", "end")).toEqual({ ok: false, message: 'deck "z" not found' });
  });

  test("after the script loses slides and beats, a kept position is pulled back", () => {
    let decks = [deck("a", { intro: 0, middle: 3, end: 0 })];
    const rooms = createRooms(() => decks);
    rooms.move("a", client(), JSON.stringify({ slideIndex: 2, beatIndex: 0 }));
    decks = [deck("a", { intro: 0, middle: 1 })];
    rooms.reclamp();
    expect(rooms.current("a")).toEqual({ slug: "middle", slideIndex: 1, beatIndex: 1 });

    rooms.move("a", client(), JSON.stringify({ slideIndex: 1, beatIndex: 1 }));
    decks = [deck("a", { intro: 0, middle: 0 })];
    rooms.reclamp();
    expect(rooms.current("a")).toEqual({ slug: "middle", slideIndex: 1, beatIndex: 0 });
  });

  test("greets a new socket with where the room stands after the script changed", () => {
    let decks = [deck("a", { intro: 0, middle: 2 })];
    const rooms = createRooms(() => decks);
    rooms.move("a", client(), JSON.stringify({ slideIndex: 1, beatIndex: 2 }));
    decks = [deck("a", { intro: 1 })];
    rooms.reclamp();
    const late = client();
    rooms.join("a", late);
    expect(late.got).toEqual([{ slideIndex: 0, beatIndex: 1 }]);
  });

  test("a room nobody moved greets no one and stands at the first slide", () => {
    const rooms = createRooms(() => [deck("a", { intro: 0 })]);
    const viewer = client();
    rooms.join("a", viewer);
    expect(viewer.got).toEqual([]);
    expect(rooms.current("a")).toEqual({ slug: "intro", slideIndex: 0, beatIndex: 0 });
  });
});
