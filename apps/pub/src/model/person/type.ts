// A person on dek.pub is a Better Auth account with a handle. The account is read as Better Auth
// hands it out, whatever else it carries; it has no handle until its holder chooses one, after
// their first sign-in, and is a Person from then on. Pages and other people see only the parts of
// it meant for them.

import { z } from "zod";

export const Account = z
  .object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    emailVerified: z.boolean().optional(),
    image: z.string().nullish(),
    handle: z.string().nullish(),
    githubLogin: z.string().nullish(),
  })
  .transform((user) => ({
    id: user.id,
    handle: user.handle ?? null,
    name: user.name,
    image: user.image ?? null,
    email: user.email,
    emailVerified: user.emailVerified === true,
    /** The GitHub login of an account made with GitHub, as GitHub spells it. */
    githubLogin: user.githubLogin ?? null,
  }));

/** The whole account. It holds the email address, so it never leaves the server. */
export type Account = z.output<typeof Account>;

/**
 * An account whose holder has chosen a handle: whoever publishes, writes a comment, holds an API
 * key, or is shown to others. Nobody without a handle gets past the API's door (`currentPerson`).
 */
export type Person = Account & { handle: string };

/** What Better Auth's api-key plugin answers when a key is checked. */
export const KeyCheck = z.object({
  valid: z.boolean(),
  key: z
    .object({ id: z.string(), referenceId: z.string().nullish(), userId: z.string().nullish() })
    .nullish(),
});

/** What it answers when a key is made; the key itself is shown only this once. */
export const MadeKey = z.object({ key: z.string() });

/**
 * The signed-in account, as every page is told who they are; its handle is null until they have
 * chosen one, which every page but the one to choose it on sends them to do first.
 */
export type Self = Pick<Account, "id" | "handle" | "name" | "image">;

/** A person as anyone else sees them: on a profile, a talk, a card. */
export type Profile = Pick<Person, "handle" | "name" | "image">;
