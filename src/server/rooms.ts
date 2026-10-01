import {
  decodePointer,
  decodePosition,
  encodePointer,
  encodePosition,
} from "../core/live-protocol.ts";
import { clampPosition, deckStops } from "../core/position.ts";
import type { ProjectDeck } from "../core/resolve.ts";
import type { Position } from "../core/step.ts";

/** A socket in a room, as far as a room needs one. */
export type RoomClient = { send(payload: string): unknown };

/**
 * Where a deck stands, as `dekc current` and `dekc goto` print it, and how many pages show it. With
 * none, the position is where the next page opened lands.
 */
type RoomPosition = { slug: string; slideIndex: number; beatIndex: number; viewers: number };

export type Rooms<C extends RoomClient> = {
  /** A socket joins its deck's room, and is told where the talk stands. */
  join(room: string, client: C): void;
  leave(room: string, client: C): void;
  /**
   * What a presenter sends, relayed to everyone else in the room: a move, kept within the deck and
   * as where the room stands; or where the laser points, kept nowhere, since a page that joins
   * later must not see a laser that pointed before it came.
   */
  relay(room: string, from: C, payload: string): void;
  /** Send the room to a slide; the reason when the deck or slide is not there. */
  goto(room: string, slug: string): { ok: true; at: RoomPosition } | { ok: false; message: string };
  current(room: string): RoomPosition;
  /** After the script changed: a kept position past a slide or beat now gone is pulled back. */
  reclamp(): void;
};

/**
 * The presenter rooms, one per deck: who is connected, and the position each deck is at.
 * `decks` is read on each call, so a room follows the script as it is now.
 */
export function createRooms<C extends RoomClient>(decks: () => ProjectDeck[]): Rooms<C> {
  const rooms = new Map<string, Set<C>>();
  const positions = new Map<string, Position>();

  const deckFor = (room: string): ProjectDeck | undefined =>
    decks().find((entry) => entry.name === room);

  /** `pos` within the room's deck; kept as sent while the deck fails to parse. */
  const within = (room: string, pos: Position): Position | undefined => {
    const deck = deckFor(room);
    return deck ? clampPosition(pos, deckStops(deck.deck.sections)) : pos;
  };

  const broadcast = (room: string, payload: string, except?: C): void => {
    for (const client of rooms.get(room) ?? []) {
      if (client !== except) {
        client.send(payload);
      }
    }
  };

  const current = (room: string): RoomPosition => {
    const deck = deckFor(room);
    const viewers = rooms.get(room)?.size ?? 0;
    const pos = positions.get(room) ?? { slideIndex: 0, beatIndex: 0 };
    const slug = deck?.deck.sections[pos.slideIndex]?.slug;
    if (!slug) {
      return { slug: deck?.deck.sections[0]?.slug ?? room, slideIndex: 0, beatIndex: 0, viewers };
    }
    return { slug, slideIndex: pos.slideIndex, beatIndex: pos.beatIndex, viewers };
  };

  return {
    join(room, client) {
      const clients = rooms.get(room) ?? new Set();
      clients.add(client);
      rooms.set(room, clients);
      const pos = positions.get(room);
      if (pos) {
        client.send(encodePosition(pos));
      }
    },
    leave(room, client) {
      const clients = rooms.get(room);
      if (!clients) {
        return;
      }
      clients.delete(client);
      if (clients.size === 0) {
        rooms.delete(room);
      }
    },
    relay(room, from, payload) {
      const laser = decodePointer(payload);
      if (laser) {
        broadcast(room, encodePointer(laser.pointer), from);
        return;
      }
      const sent = decodePosition(payload);
      const pos = sent && within(room, sent);
      if (!pos) {
        return;
      }
      positions.set(room, pos);
      broadcast(room, encodePosition(pos), from);
    },
    goto(room, slug) {
      const deck = deckFor(room);
      if (!deck) {
        return { ok: false, message: `deck "${room}" not found` };
      }
      const slideIndex = deck.deck.sections.findIndex((section) => section.slug === slug);
      if (slideIndex < 0) {
        return { ok: false, message: `section "${slug}" not found` };
      }
      const pos = { slideIndex, beatIndex: 0 };
      positions.set(room, pos);
      broadcast(room, encodePosition(pos));
      return { ok: true, at: current(room) };
    },
    current,
    reclamp() {
      for (const [room, pos] of positions) {
        const kept = within(room, pos);
        if (kept) {
          positions.set(room, kept);
        } else {
          positions.delete(room);
        }
      }
    },
  };
}
