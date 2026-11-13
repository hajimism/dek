// A person on dek.pub is a Better Auth account with a handle. The account is read as Better Auth
// hands it out, whatever else it carries, and becomes a Person; pages and other people see only
// the parts of it meant for them.

import { z } from "zod";

export const Account = z
  .object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    emailVerified: z.boolean().optional(),
    image: z.string().nullish(),
    handle: z.string().nullish(),
  })
  .transform((user) => ({
    id: user.id,
    // An account made before handles were set has none; its ID stands in.
    handle: user.handle ?? user.id,
    name: user.name,
    image: user.image ?? null,
    email: user.email,
    emailVerified: user.emailVerified === true,
  }));

/** The whole account. It holds the email address, so it never leaves the server. */
export type Person = z.output<typeof Account>;

/** The signed-in person, as every page is told who they are. */
export type Self = Pick<Person, "id" | "handle" | "name" | "image">;

/** A person as anyone else sees them: on a profile, a talk, a card. */
export type Profile = Pick<Person, "handle" | "name" | "image">;
