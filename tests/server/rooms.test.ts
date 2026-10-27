import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import { encodePointer, encodePosition, type Pointer } from "../../src/core/live-protocol.ts";
import type { ProjectDeck } from "../../src/core/resolve.ts";
import { roomSockets } from "../../src/server/dev.ts";
import { createRooms, type RoomClient, type Rooms } from "../../src/server/rooms.ts";
import type { WsData } from "../../src/server/routes.ts";
import { propertyTest } from "../helpers/fc.ts";

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
    rooms.relay("a", sender, JSON.stringify({ slideIndex: 1, beatIndex: 0, extra: "x" }));
    expect(receiver.got).toEqual([{ slideIndex: 1, beatIndex: 0 }]);
    expect(sender.got).toEqual([]);
    expect(other.got).toEqual([]);
  });

  test("relays where the laser points to the rest of the room, and keeps it nowhere", () => {
    const rooms = createRooms(() => [deck("a", { intro: 0, end: 0 })]);
    const [sender, receiver] = [client(), client()];
    rooms.join("a", sender);
    rooms.join("a", receiver);
    rooms.relay("a", sender, JSON.stringify({ pointer: { slideIndex: 1, x: 0.5, y: 0.25 } }));
    rooms.relay("a", sender, JSON.stringify({ pointer: null }));
    expect(receiver.got).toEqual([
      { pointer: { slideIndex: 1, x: 0.5, y: 0.25 } },
      { pointer: null },
    ]);
    expect(sender.got).toEqual([]);
    // A page that joins later sees the slide, not a laser that pointed before it came.
    const late = client();
    rooms.join("a", late);
    expect(late.got).toEqual([]);
    expect(rooms.current("a")).toMatchObject({ slideIndex: 0, beatIndex: 0 });
  });

  test("drops what is neither a move nor a point", () => {
    const rooms = createRooms(() => [deck("a", { intro: 0 })]);
    const [sender, receiver] = [client(), client()];
    rooms.join("a", sender);
    rooms.join("a", receiver);
    rooms.relay("a", sender, JSON.stringify({ pointer: { slideIndex: 0, x: 9, y: 0 } }));
    rooms.relay("a", sender, "hello");
    expect(receiver.got).toEqual([]);
  });

  test("pins a move past the deck to its last beat once, and relays that", () => {
    const rooms = createRooms(() => [deck("a", { intro: 0, end: 2 })]);
    const [sender, receiver] = [client(), client()];
    rooms.join("a", sender);
    rooms.join("a", receiver);
    rooms.relay("a", sender, JSON.stringify({ slideIndex: 7, beatIndex: 9 }));
    expect(receiver.got).toEqual([{ slideIndex: 1, beatIndex: 2 }]);
    expect(rooms.current("a")).toEqual({ slug: "end", slideIndex: 1, beatIndex: 2, viewers: 2 });
  });

  test("goto moves everyone in the room and says where it stands", () => {
    const rooms = createRooms(() => [deck("a", { intro: 0, end: 2 })]);
    const viewer = client();
    rooms.join("a", viewer);
    expect(rooms.goto("a", "end")).toEqual({
      ok: true,
      at: { slug: "end", slideIndex: 1, beatIndex: 0, viewers: 1 },
    });
    expect(viewer.got).toEqual([{ slideIndex: 1, beatIndex: 0 }]);
    expect(rooms.goto("a", "nope")).toEqual({ ok: false, message: 'section "nope" not found' });
    expect(rooms.goto("z", "end")).toEqual({ ok: false, message: 'deck "z" not found' });
  });

  test("after the script loses slides and beats, a kept position is pulled back", () => {
    let decks = [deck("a", { intro: 0, middle: 3, end: 0 })];
    const rooms = createRooms(() => decks);
    rooms.relay("a", client(), JSON.stringify({ slideIndex: 2, beatIndex: 0 }));
    decks = [deck("a", { intro: 0, middle: 1 })];
    rooms.reclamp();
    expect(rooms.current("a")).toEqual({
      slug: "middle",
      slideIndex: 1,
      beatIndex: 1,
      viewers: 0,
    });

    rooms.relay("a", client(), JSON.stringify({ slideIndex: 1, beatIndex: 1 }));
    decks = [deck("a", { intro: 0, middle: 0 })];
    rooms.reclamp();
    expect(rooms.current("a")).toEqual({
      slug: "middle",
      slideIndex: 1,
      beatIndex: 0,
      viewers: 0,
    });
  });

  test("greets a new socket with where the room stands after the script changed", () => {
    let decks = [deck("a", { intro: 0, middle: 2 })];
    const rooms = createRooms(() => decks);
    rooms.relay("a", client(), JSON.stringify({ slideIndex: 1, beatIndex: 2 }));
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
    expect(rooms.current("a")).toEqual({ slug: "intro", slideIndex: 0, beatIndex: 0, viewers: 1 });
  });
});

type Position = { slideIndex: number; beatIndex: number };

/**
 * What the rooms promise, kept apart from them: each deck's slides as their beat counts, who is
 * in which room and whether a presenter, where each room stands, and every message each socket
 * must have been sent, in order.
 */
type RoomModel = {
  decks: Map<string, number[]>;
  members: Map<number, { socket: number; room: string; control: boolean }>;
  positions: Map<string, Position>;
  sent: string[][];
};

type FakeSocket = { data: WsData; got: string[]; send(payload: string): void };

type RoomReal = {
  decks: ProjectDeck[];
  rooms: Rooms<RoomClient>;
  handler: Bun.WebSocketHandler<WsData>;
  sockets: FakeSocket[];
  open: Map<number, FakeSocket>;
};

/** The rooms a socket may ask for: two decks, and one no deck has. */
const ROOMS = ["a", "b", "gone"] as const;

/** `pos` within the deck, as the rooms promise: a beat past its slide's last is that last beat. */
function within(model: RoomModel, room: string, pos: Position): Position | undefined {
  const beats = model.decks.get(room);
  if (beats === undefined) {
    return pos;
  }
  const last = beats.length - 1;
  if (last < 0) {
    return undefined;
  }
  return pos.slideIndex > last
    ? { slideIndex: last, beatIndex: beats[last] ?? 0 }
    : { ...pos, beatIndex: Math.min(pos.beatIndex, beats[pos.slideIndex] ?? 0) };
}

function currentOf(model: RoomModel, room: string) {
  const beats = model.decks.get(room);
  const viewers = [...model.members.values()].filter((member) => member.room === room).length;
  const pos = model.positions.get(room) ?? { slideIndex: 0, beatIndex: 0 };
  return beats !== undefined && pos.slideIndex < beats.length
    ? { slug: `s${pos.slideIndex}`, ...pos, viewers }
    : { slug: beats?.length ? "s0" : room, slideIndex: 0, beatIndex: 0, viewers };
}

/** Sends `payload` to every member of `room` but `except`, in the model. */
function deliver(model: RoomModel, room: string, payload: string, except?: number): void {
  for (const [id, member] of model.members) {
    if (member.room === room && id !== except) {
      model.sent[member.socket]?.push(payload);
    }
  }
}

function deckOf(name: string, beats: number[]): ProjectDeck {
  const sections = beats.map((count, at) => ({
    slug: `s${at}`,
    beats: Array.from({ length: count }, () => ({})),
  }));
  return { name, deck: { sections } } as unknown as ProjectDeck;
}

/** After each step: every socket got exactly what the model says, and every room stands where it says. */
function agree(model: RoomModel, real: RoomReal): void {
  expect(real.sockets.map((socket) => socket.got)).toEqual(model.sent);
  for (const room of ROOMS) {
    expect({ room, at: real.rooms.current(room) }).toEqual({ room, at: currentOf(model, room) });
  }
}

type RoomCommand = fc.Command<RoomModel, RoomReal>;

function roomCommand(
  name: string,
  check: (model: Readonly<RoomModel>) => boolean,
  run: (model: RoomModel, real: RoomReal) => void,
): RoomCommand {
  return {
    check,
    run(model, real) {
      run(model, real);
      agree(model, real);
    },
    toString: () => name,
  };
}

const socketId = fc.nat(3);

const openSocket = fc
  .tuple(socketId, fc.constantFrom(...ROOMS), fc.boolean())
  .map(([id, room, control]) =>
    roomCommand(
      `open(${id}, ${room}, ${control ? "presenter" : "audience"})`,
      (model) => !model.members.has(id),
      (model, real) => {
        const socket: FakeSocket = {
          data: { room, control },
          got: [],
          send(payload) {
            this.got.push(payload);
          },
        };
        real.sockets.push(socket);
        real.open.set(id, socket);
        real.handler.open?.(socket as unknown as Bun.ServerWebSocket<WsData>);
        const pos = model.positions.get(room);
        model.sent.push(pos ? [encodePosition(pos)] : []);
        model.members.set(id, { socket: model.sent.length - 1, room, control });
      },
    ),
  );

const closeSocket = socketId.map((id) =>
  roomCommand(
    `close(${id})`,
    (model) => model.members.has(id),
    (model, real) => {
      const socket = real.open.get(id);
      real.open.delete(id);
      real.handler.close?.(socket as unknown as Bun.ServerWebSocket<WsData>, 1000, "");
      model.members.delete(id);
    },
  ),
);

/** A message as a socket sends it, and the move or point it is, if any. */
type Payload = { text: string; move?: Position; point?: Pointer | null };

const payload: fc.Arbitrary<Payload> = fc.oneof(
  fc
    .record({ slideIndex: fc.nat(5), beatIndex: fc.nat(5) })
    .map((move) => ({ text: JSON.stringify({ ...move, extra: "x" }), move })),
  fc
    .record({
      slideIndex: fc.nat(5),
      x: fc.double({ min: 0, max: 1, noNaN: true }),
      y: fc.double({ min: 0, max: 1, noNaN: true }),
    })
    .map((point) => ({ text: JSON.stringify({ pointer: point }), point })),
  fc.constant({ text: JSON.stringify({ pointer: null }), point: null }),
  // Neither a move nor a point: dropped, from a presenter too.
  fc
    .constantFrom(
      "hello",
      "null",
      "{}",
      '{"slideIndex":-1,"beatIndex":0}',
      '{"slideIndex":1.5,"beatIndex":0}',
      '{"pointer":{"slideIndex":0,"x":9,"y":0}}',
    )
    .map((text) => ({ text })),
);

const sendMessage = fc.tuple(socketId, payload, fc.boolean()).map(([id, message, binary]) =>
  roomCommand(
    `send(${id}, ${message.text}${binary ? ", binary" : ""})`,
    (model) => model.members.has(id),
    (model, real) => {
      const socket = real.open.get(id) as unknown as Bun.ServerWebSocket<WsData>;
      real.handler.message(socket, binary ? Buffer.from(message.text) : message.text);
      const member = model.members.get(id);
      if (!member?.control) {
        return;
      }
      if (message.point !== undefined) {
        deliver(model, member.room, encodePointer(message.point), id);
      } else if (message.move) {
        const pos = within(model, member.room, message.move);
        if (pos) {
          model.positions.set(member.room, pos);
          deliver(model, member.room, encodePosition(pos), id);
        }
      }
    },
  ),
);

const gotoSlide = fc
  .tuple(fc.constantFrom(...ROOMS), fc.constantFrom("s0", "s1", "s3", "nope"))
  .map(([room, slug]) =>
    roomCommand(
      `goto(${room}, ${slug})`,
      () => true,
      (model, real) => {
        const result = real.rooms.goto(room, slug);
        const beats = model.decks.get(room);
        const slideIndex = Number(slug.slice(1));
        if (beats === undefined) {
          expect(result).toEqual({ ok: false, message: `deck "${room}" not found` });
        } else if (!(slideIndex < beats.length)) {
          expect(result).toEqual({ ok: false, message: `section "${slug}" not found` });
        } else {
          const pos = { slideIndex, beatIndex: 0 };
          model.positions.set(room, pos);
          deliver(model, room, encodePosition(pos));
          expect(result).toEqual({ ok: true, at: currentOf(model, room) });
        }
      },
    ),
  );

/** The script changes, or stops parsing, and the server pulls each room back into its deck. */
const editScript = fc
  .tuple(
    fc.constantFrom("a", "b"),
    fc.option(fc.array(fc.nat(3), { maxLength: 4 }), { nil: undefined }),
  )
  .map(([room, beats]) =>
    roomCommand(
      `edit(${room}, ${beats === undefined ? "unreadable" : `[${beats}]`})`,
      () => true,
      (model, real) => {
        if (beats === undefined) {
          model.decks.delete(room);
        } else {
          model.decks.set(room, beats);
        }
        real.decks = [...model.decks].map(([name, counts]) => deckOf(name, counts));
        real.rooms.reclamp();
        for (const [at, pos] of model.positions) {
          const kept = within(model, at, pos);
          if (kept) {
            model.positions.set(at, kept);
          } else {
            model.positions.delete(at);
          }
        }
      },
    ),
  );

describe("the rooms, against a model of what they promise", () => {
  // Whatever sockets open, close, send, and whatever the script becomes: a socket that joins is
  // told where its room stands; only a presenter's move or point reaches the others in its room,
  // a move kept within the deck and as where the room stands, a point kept nowhere; goto moves
  // everyone in the room; a socket that leaves is sent nothing more and no longer counted.
  propertyTest(
    "send every socket what the model says, and stand where it says",
    fc.property(
      fc.commands([openSocket, closeSocket, sendMessage, gotoSlide, editScript], {
        maxCommands: 40,
        size: "+1",
      }),
      (commands) => {
        const setup = () => {
          const model: RoomModel = {
            decks: new Map([
              ["a", [0, 2, 1]],
              ["b", [3]],
            ]),
            members: new Map(),
            positions: new Map(),
            sent: [],
          };
          const real: RoomReal = {
            decks: [deckOf("a", [0, 2, 1]), deckOf("b", [3])],
            rooms: createRooms<RoomClient>(() => real.decks),
            handler: undefined as unknown as Bun.WebSocketHandler<WsData>,
            sockets: [],
            open: new Map(),
          };
          real.handler = roomSockets(real.rooms);
          return { model, real };
        };
        fc.modelRun(setup, commands);
      },
    ),
  );
});
