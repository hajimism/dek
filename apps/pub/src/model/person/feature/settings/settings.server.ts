// What a person changes of themself on the settings page: the links their profile shows, all of
// them at once, and their name. Each is read by the rules the page checks it by, and refused with
// a code of its own.

import type { Context } from "hono";
import type { Me, ProfileLinks } from "../../../../../../../src/pub/protocol.ts";
import { ApiError } from "../../../../common/api-error.ts";
import { requirePerson } from "../../actor.server.ts";
import { linksOf, setLinks } from "../../link.server.ts";
import { type LinksProblem, MAX_LINK_LENGTH, MAX_LINKS, readLinks } from "../../link.ts";
import { MAX_NAME_LENGTH, readName } from "../../name.ts";
import { meOf } from "../../person.ts";
import { setName } from "../../store.server.ts";
import { LINK_CODES, NAME_CODES } from "./type.ts";

export async function myLinks(c: Context): Promise<ProfileLinks> {
  const person = await requirePerson(c);
  return { links: await linksOf(person.id) };
}

const LINK_MESSAGES: Record<LinksProblem, string> = {
  invalid: "is not a web address",
  not_https: "is not an https address",
  credentials: "carries a user name or a password",
  too_long: `is longer than ${MAX_LINK_LENGTH} characters`,
  duplicate: "is in the list already",
  too_many: `a profile shows up to ${MAX_LINKS} links`,
};

/** Make `inputs` the links the calling person's profile shows, in their order. */
export async function saveLinks(c: Context, inputs: readonly string[]): Promise<ProfileLinks> {
  const person = await requirePerson(c);
  const read = readLinks(inputs);
  if (!read.ok) {
    const what = LINK_MESSAGES[read.problem];
    throw new ApiError(
      422,
      LINK_CODES[read.problem],
      read.at === null ? what : `link ${read.at + 1} ${what}`,
    );
  }
  await setLinks(person.id, read.links);
  return { links: read.links };
}

/** Give the calling person the name `input` reads as. */
export async function saveName(c: Context, input: string): Promise<Me> {
  const person = await requirePerson(c);
  const read = readName(input);
  if (!read.ok) {
    throw new ApiError(
      422,
      NAME_CODES[read.problem],
      read.problem === "empty"
        ? "a name cannot be empty"
        : `a name is up to ${MAX_NAME_LENGTH} characters`,
    );
  }
  await setName(c, person.id, read.name);
  return meOf({ ...person, name: read.name });
}
