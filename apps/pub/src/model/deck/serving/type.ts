// What the app and the serve Worker tell each other about a deck: the access file in R2 beside it,
// and the token in a deck's URL. Both arrive from outside the Worker's own code, so both are read
// through these shapes.

import { z } from "zod";
import { Visibility } from "../../../../../../src/pub/protocol.ts";

/** The builds of a version: the speaker's whole script, what is said aloud, or no script at all. */
export const Variant = z.enum(["full", "public", "bare"]);
export type Variant = z.infer<typeof Variant>;

/** What the serve Worker may hand out without a token, as `decks/<id>/access.json` holds it. */
export const DeckAccess = z.object({
  visibility: Visibility,
  scriptPublic: z.boolean(),
  embed: z.boolean(),
  current: z.int().nullable(),
});
export type DeckAccess = z.infer<typeof DeckAccess>;

export const ServeClaims = z.object({
  deck: z.string(),
  n: z.int(),
  variant: Variant,
  /** Expiry, in seconds since the epoch. */
  exp: z.int(),
});
export type ServeClaims = z.infer<typeof ServeClaims>;
