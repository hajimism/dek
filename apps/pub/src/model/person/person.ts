// What of a person each reader is shown.

import type { Me } from "../../../../../src/pub/protocol.ts";
import type { Person, Profile, Self } from "./type.ts";

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
