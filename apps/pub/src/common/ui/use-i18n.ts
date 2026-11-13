// The words of the page's language, for a component that needs nothing else from the page.

import { useShared } from "@void/svelte";
import { type Lang, type MessageKey, translate, type Vars } from "../i18n.ts";

export type T = (key: MessageKey, vars?: Vars) => string;

export function useI18n(): { lang: Lang; t: T } {
  const { lang } = useShared() as { lang: Lang };
  return { lang, t: (key, vars) => translate(lang, key, vars) };
}
