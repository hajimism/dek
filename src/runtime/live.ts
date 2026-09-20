import type { Diagnostic } from "../core/diagnostic.ts";
import { withDeckPrefix } from "./routes.ts";
import { applyIsShown, type StepElement } from "./step.ts";

export type LiveSlide = {
  querySelectorAll(selector: string): StepElement[];
};

export type LiveHost = {
  replaceSlide(slug: string, html: string): LiveSlide | undefined;
  setTheme(css: string): void;
  setDiagnostics(text: string | null): void;
};

export type LivePayload =
  | { type: "sync"; created: string[]; removed?: string[] }
  | { type: "reload-slide"; slug: string; html?: string }
  | { type: "reload-theme"; css?: string }
  | { type: "diagnostics"; diagnostics: Diagnostic[] }
  | { type: "timeline" };

export function slideSelector(slug: string): string {
  const escaped = slug.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `#deck > .slide[data-slug="${escaped}"]`;
}

/** The slice of `fetch` the live client uses; keeps test stubs free of the fetch namespace. */
export type LiveFetch = (input: string) => Promise<Response>;

export async function hydrateLiveEvent(
  event: LivePayload,
  pathname: string,
  fetchImpl: LiveFetch = fetch,
): Promise<LivePayload | undefined> {
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

export function applyLiveEvent(
  event: LivePayload,
  host: LiveHost,
  options: { shown: Set<string> },
): { reload: boolean } {
  switch (event.type) {
    case "sync":
      return { reload: true };
    case "reload-slide": {
      const slide = host.replaceSlide(event.slug, event.html ?? "");
      if (slide) {
        applyIsShown(slide.querySelectorAll("[data-step]"), options.shown);
      }
      return { reload: false };
    }
    case "reload-theme":
      host.setTheme(event.css ?? "");
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
  return diagnostics.map((diagnostic) => `${diagnostic.id}: ${diagnostic.message}`).join("\n");
}

export function liveSlidePath(pathname: string, slug: string): string {
  return withDeckPrefix(pathname, `/slide/${encodeURIComponent(slug)}`);
}

export function liveThemePath(pathname: string): string {
  return withDeckPrefix(pathname, "/theme");
}
