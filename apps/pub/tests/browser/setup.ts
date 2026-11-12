// Rendering a component as a Void page would: with the shared data in context.

import type { Component, ComponentProps } from "svelte";
import { render } from "vitest-browser-svelte";
import type { Shared } from "../../middleware/01.shared.ts";

export const NOW = Date.parse("2026-11-13T12:00:00Z");

export function shared(overrides: Partial<Shared> = {}): Shared {
  return {
    viewer: { id: "u1", handle: "demo", name: "Hajime Nakagawa", image: null },
    lang: "en",
    theme: "system",
    devLogin: false,
    turnstileSiteKey: "",
    now: NOW,
    ...overrides,
  };
}

// biome-ignore lint/suspicious/noExplicitAny: any component, as Svelte's own ComponentProps takes one.
export function renderPage<C extends Component<any>>(
  component: C,
  props: ComponentProps<C>,
  overrides: Partial<Shared> = {},
) {
  return render(component as never, {
    props,
    context: new Map([["__void_shared", { value: shared(overrides) }]]),
  } as never);
}
