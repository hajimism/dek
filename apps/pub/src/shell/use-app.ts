// What a component needs from the page it is on: the shared data and the words in its language.

import { useShared } from "@void/svelte";
import { type T, useI18n } from "../common/ui/use-i18n.ts";
import type { Shared } from "./type.ts";

export function useApp(): { shared: Shared; lang: Shared["lang"]; t: T } {
  return { shared: useShared() as Shared, ...useI18n() };
}
