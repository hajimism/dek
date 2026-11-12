// What components take from @void/svelte, outside a Void app: the page's shared data, from the
// same context key Void sets it under.

import { getContext } from "svelte";

export function useShared<T>(): T {
  const ctx = getContext<{ value: T } | undefined>("__void_shared");
  if (!ctx) {
    throw new Error("useShared(): render the component with renderPage()");
  }
  return ctx.value;
}
