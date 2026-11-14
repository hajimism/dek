// What of a person each reader is shown.

import type { Me } from "../../../../../src/pub/protocol.ts";
import { Account, type Person, type Profile, type Self } from "./type.ts";

/**
 * An account Better Auth handed out, as a Person; null, with the reason logged, for a record that
 * is not one, so one odd account cannot fail every page it shows on.
 */
export function readAccount(user: unknown): Person | null {
  const read = Account.safeParse(user);
  if (!read.success) {
    console.error("dek.pub cannot read an account:", read.error.message);
    return null;
  }
  return read.data;
}

export function selfOf(person: Person): Self {
  return { id: person.id, handle: person.handle, name: person.name, image: person.image };
}

export function profileOf(person: Person): Profile {
  return { handle: person.handle, name: person.name, image: person.image };
}

/** The person as the CLI is told who it is signed in as. */
export function meOf(person: Person): Me {
  return { id: person.id, handle: person.handle, name: person.name };
}

/**
 * Who wrote a comment or a reply, as anyone who reads it is told: its author's name and handle,
 * among `people`; one whose account is gone is "someone".
 */
export function authorOf(
  row: { authorId: string },
  people: Map<string, Person>,
): { name: string; handle: string } {
  const person = people.get(row.authorId);
  return { name: person?.name ?? "someone", handle: person?.handle ?? row.authorId };
}
