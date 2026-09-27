import type { Diagnostic } from "../core/diagnostic.ts";
import type { LiveEvent } from "../core/live-protocol.ts";
import { deckUrl } from "./routes.ts";

/** What live reload changes on the page; the stage draws the current beat again after. */
export type LiveHost = {
  replaceSlide(slug: string, html: string): void;
  setTheme(css: string): void;
  setDiagnostics(text: string | null): void;
};

type Hydrated<Type extends LiveEvent["type"], Extra> = Extract<LiveEvent, { type: Type }> & Extra;

/** A live event with what it names fetched: a slide's new fragment, the theme's new CSS. */
export type HydratedLiveEvent =
  | Exclude<LiveEvent, { type: "reload-slide" | "reload-theme" }>
  | Hydrated<"reload-slide", { html: string }>
  | Hydrated<"reload-theme", { css: string }>;

export function slideSelector(slug: string): string {
  const escaped = slug.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `#deck > .slide[data-slug="${escaped}"]`;
}

/** The slice of `fetch` the live client uses; keeps test stubs free of the fetch namespace. */
export type LiveFetch = (input: string) => Promise<Response>;

export async function hydrateLiveEvent(
  event: LiveEvent,
  pathname: string,
  fetchImpl: LiveFetch = fetch,
): Promise<HydratedLiveEvent | undefined> {
  if (event.type === "reload-slide") {
    const response = await fetchImpl(liveSlidePath(pathname, event.slug));
    if (!response.ok) {
      return undefined;
    }
    return { ...event, html: await response.text() };
  }
  if (event.type === "reload-theme") {
    const response = await fetchImpl(liveThemePath(pathname));
    if (!response.ok) {
      return undefined;
    }
    return { ...event, css: await response.text() };
  }
  return event;
}

export function applyLiveEvent(event: HydratedLiveEvent, host: LiveHost): { reload: boolean } {
  switch (event.type) {
    case "sync":
    case "reload-script":
      return { reload: true };
    case "reload-slide":
      host.replaceSlide(event.slug, event.html);
      return { reload: false };
    case "reload-theme":
      host.setTheme(event.css);
      return { reload: false };
    case "diagnostics":
      host.setDiagnostics(formatLiveDiagnostics(event.diagnostics));
      return { reload: false };
    case "timeline":
      return { reload: false };
  }
}

export function formatLiveDiagnostics(diagnostics: Diagnostic[]): string | null {
  if (diagnostics.length === 0) {
    return null;
  }
  return diagnostics
    .map((diagnostic) =>
      diagnostic.severity === "warning"
        ? `${diagnostic.id} warning: ${diagnostic.message}`
        : `${diagnostic.id}: ${diagnostic.message}`,
    )
    .join("\n");
}

export function liveSlidePath(pathname: string, slug: string): string {
  return deckUrl(pathname, { kind: "slide", slug });
}

export function liveThemePath(pathname: string): string {
  return deckUrl(pathname, { kind: "theme" });
}
