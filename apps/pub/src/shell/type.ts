// What every page knows before its own loader runs.

import { z } from "zod";
import type { Lang } from "../common/i18n.ts";
import type { Self } from "../model/person/type.ts";

/** The reader's theme, as its cookie holds it; anything else there is the system's. */
export const Theme = z.enum(["system", "light", "dark"]).catch("system");
export type Theme = z.infer<typeof Theme>;

export type Shared = {
  viewer: Self | null;
  lang: Lang;
  theme: Theme;
  devLogin: boolean;
  turnstileSiteKey: string;
  /** The time the page was made, so relative times render the same on the server and in the browser. */
  now: number;
};
