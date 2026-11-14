// Rendering a component as a Void page would: with the shared data in context.

import { render } from "vitest-browser-svelte";
import type { Shared } from "../../src/shell/type.ts";

export const NOW = Date.parse("2026-11-13T12:00:00Z");

export function shared(overrides: Partial<Shared> = {}): Shared {
  return {
    viewer: { id: "u1", handle: "demo", name: "Hajime Nakagawa", image: null },
    lang: "en",
    theme: "system",
    devLogin: false,
    now: NOW,
    ...overrides,
  };
}

/** What a rendered page component gives a test: its props can be set again, and it can go. */
export type Rendered = {
  rerender: (props: Record<string, unknown>) => Promise<void>;
  unmount: () => Promise<void>;
};

/**
 * Render a component with the shared data a Void page has. Props are checked by the component at
 * run time; Svelte's generic and exporting components do not fit one static props type.
 */
export async function renderPage(
  component: unknown,
  props: Record<string, unknown>,
  overrides: Partial<Shared> = {},
): Promise<Rendered> {
  const result = await render(
    component as never,
    {
      props,
      context: new Map([["__void_shared", { value: shared(overrides) }]]),
    } as never,
  );
  return { rerender: (next) => result.rerender(next as never), unmount: () => result.unmount() };
}
