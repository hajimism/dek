import type { Diagnostic } from "../core/diagnostic.ts";
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
  const deck = pathname.match(/^\/decks\/([^/]+)/)?.[1];
  return deck
    ? `/decks/${deck}/slide/${encodeURIComponent(slug)}`
    : `/slide/${encodeURIComponent(slug)}`;
}

export function liveThemePath(pathname: string): string {
  const deck = pathname.match(/^\/decks\/([^/]+)/)?.[1];
  return deck ? `/decks/${deck}/theme` : "/theme";
}
