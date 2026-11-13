// What a component needs from the page it is on: the shared data and the words in its language.

import { useShared } from "@void/svelte";
import type { Shared } from "../../middleware/01.shared.ts";
import { type MessageKey, translate, type Vars } from "../lib/i18n.ts";

export type T = (key: MessageKey, vars?: Vars) => string;

export function useApp(): { shared: Shared; lang: Shared["lang"]; t: T } {
  const shared = useShared() as Shared;
  return { shared, lang: shared.lang, t: (key, vars) => translate(shared.lang, key, vars) };
}
