import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { deckPaths } from "../core/deck-paths.ts";
import type { LiveEvent } from "../core/live-protocol.ts";
import { listSlideFiles, type SlideSidecar } from "../core/resolve.ts";

/** Modification times by name; a file that is gone is left out. */
export type Mtimes = Record<string, number>;

/** What a deck watcher compares between scans: the mtime of every file a page is made from. */
export type DeckSnapshot = {
  script: number;
  theme: number;
  /** `slides/<slug>.html`, and each sidecar kind, keyed by slug. */
  slides: Mtimes;
  styles: Mtimes;
  scripts: Mtimes;
  /** `.js` scripts, which dekc does not load but lint names so the author can rename them. */
  javascript: Mtimes;
  /** `voice/voice.toml`, `voice/dict.toml`, and `voice/pin/*`. */
  voice: Mtimes;
};

/** Which slides to lint: one slug, or the whole deck when it is left out. */
export type DiagnoseScope = { slug?: string };

/** What one scan found to do. */
export type DeckChange = {
  /** The script changed: sync its slides first. */
  sync: boolean;
  events: LiveEvent[];
  diagnose?: DiagnoseScope;
  synth: boolean;
};

export function takeSnapshot(deckDir: string): DeckSnapshot {
  const paths = deckPaths(deckDir);
  return {
    script: mtime(paths.script),
    theme: mtime(paths.theme),
    slides: slideMtimes(deckDir),
    styles: slideMtimes(deckDir, ".css"),
    scripts: slideMtimes(deckDir, ".ts"),
    javascript: slideMtimes(deckDir, ".js"),
    voice: voiceMtimes(paths.voice),
  };
}

/**
 * What changed from `prev` to `next`, as the events a page hears and the work that follows.
 * Any change counts, an older mtime too: a file restored from a copy is still an edit.
 */
export function diffSnapshot(prev: DeckSnapshot, next: DeckSnapshot): DeckChange {
  const events: LiveEvent[] = [];
  let diagnose: DiagnoseScope | undefined;
  const lint = (scope: DiagnoseScope): void => {
    diagnose = mergeScope(diagnose, scope);
  };

  const sync = next.script !== prev.script;
  if (sync) {
    lint({});
  }
  if (next.theme !== prev.theme || changedKeys(prev.styles, next.styles).length > 0) {
    events.push({ type: "reload-theme" });
    lint({});
  }
  // Slide scripts register once at page load, so a change reloads the page.
  const scripts = changedKeys(prev.scripts, next.scripts);
  if (scripts.length > 0) {
    events.push({ type: "reload-script", slugs: scripts });
    lint({});
  }
  if (changedKeys(prev.javascript, next.javascript).length > 0) {
    lint({});
  }
  // A sync reloads the whole page, and the slides it writes are no edit of the author's.
  if (!sync) {
    const removed = Object.keys(prev.slides).filter((slug) => !(slug in next.slides));
    if (removed.length > 0) {
      events.push({ type: "sync", created: [], removed });
      lint({});
    }
    for (const [slug, time] of Object.entries(next.slides)) {
      if (time !== prev.slides[slug]) {
        events.push({ type: "reload-slide", slug });
        lint({ slug });
      }
    }
  }
  const synth = sync || changedKeys(prev.voice, next.voice).length > 0;
  return { sync, events, ...(diagnose ? { diagnose } : {}), synth };
}

/** One slide stays one slide; two different ones, or the whole deck, lint the whole deck. */
export function mergeScope(a: DiagnoseScope | undefined, b: DiagnoseScope): DiagnoseScope {
  if (!a) {
    return b;
  }
  return a.slug !== undefined && a.slug === b.slug ? a : {};
}

/** Mtimes of `slides/<slug><ext>`, keyed by slug; the same files lint and render read. */
export function slideMtimes(
  deckDir: string,
  ext: ".html" | ".js" | SlideSidecar = ".html",
): Mtimes {
  return Object.fromEntries(
    listSlideFiles(deckDir, ext).map((file) => [file.slug, mtime(file.path)]),
  );
}

function voiceMtimes(dir: string): Mtimes {
  const times: Mtimes = {};
  if (!existsSync(dir)) {
    return times;
  }
  for (const name of ["voice.toml", "dict.toml"]) {
    const path = join(dir, name);
    if (existsSync(path)) {
      times[name] = mtime(path);
    }
  }
  const pinDir = join(dir, "pin");
  if (!existsSync(pinDir)) {
    return times;
  }
  for (const name of readdirSync(pinDir)) {
    times[`pin/${name}`] = mtime(join(pinDir, name));
  }
  return times;
}

/** Keys whose mtime changed, including files added or removed. */
function changedKeys(previous: Mtimes, next: Mtimes): string[] {
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
  return [...keys].filter((key) => (previous[key] ?? 0) !== (next[key] ?? 0)).sort();
}

function mtime(path: string): number {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return 0;
  }
}
