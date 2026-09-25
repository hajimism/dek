import { existsSync, readdirSync, statSync, watch } from "node:fs";
import { basename, join } from "node:path";
import { type Diagnostic, errorDiagnostic } from "../core/diagnostic.ts";
import { DekError } from "../core/error.ts";
import { lintDeck, resolveDeck, type SyncResult, syncDeck, warmLintDeck } from "../core/index.ts";
import type { PlaywrightRunner } from "../core/playwright.ts";
import { listSlideFiles, type SlideSidecar } from "../core/resolve.ts";
import { lintVisualDeck } from "../core/visual.ts";
import type { EventHub } from "./hub.ts";
import { createSerialTask } from "./serial.ts";

export type Stoppable = { close: () => void };

/** How often a watcher re-scans for edits fs.watch missed; shared by the deck and project polls. */
export const POLL_INTERVAL_MS = 2000;

export function watchTargets(project: {
  decks: Array<{ dir: string }>;
  failed: Array<{ dir: string }>;
}): string[] {
  const dirs: string[] = [];
  const seen = new Set<string>();
  for (const entry of [...project.decks, ...project.failed]) {
    if (seen.has(entry.dir)) {
      continue;
    }
    seen.add(entry.dir);
    dirs.push(entry.dir);
  }
  return dirs;
}

export function watchDeck(
  deckDir: string,
  hub: EventHub,
  options: {
    visual?: boolean;
    visualRunner?: PlaywrightRunner;
    pollIntervalMs?: number;
    setInterval?: typeof setInterval;
    clearInterval?: typeof clearInterval;
    synthVoice?: () => Promise<void>;
  } = {},
): Stoppable {
  const scriptPath = join(deckDir, "script.md");
  const themePath = join(deckDir, "theme.css");
  let lastScript = mtime(scriptPath);
  let lastTheme = mtime(themePath);
  let lastSlides = listSlideMtimes(deckDir);
  let lastStyles = listSlideMtimes(deckDir, ".css");
  let lastScripts = listSlideMtimes(deckDir, ".ts");
  let lastJavascript = listSlideMtimes(deckDir, ".js");
  const voiceDir = join(deckDir, "voice");
  let lastVoice = listVoiceMtimes(voiceDir);
  let closed = false;
  let debounce: ReturnType<typeof setTimeout> | undefined;
  const startInterval = options.setInterval ?? setInterval;
  const stopInterval = options.clearInterval ?? clearInterval;

  let visualEnabled = options.visual === true;
  let diagnosticsRunning = false;
  let diagnosticsQueued = false;
  let queuedAll = false;
  let queuedSlug: string | undefined;

  const emitDiagnostics = (slug?: string): void => {
    if (slug === undefined) {
      queuedAll = true;
      queuedSlug = undefined;
    } else if (!queuedAll) {
      if (queuedSlug !== undefined && queuedSlug !== slug) {
        queuedAll = true;
        queuedSlug = undefined;
      } else {
        queuedSlug = slug;
      }
    }
    if (diagnosticsRunning) {
      diagnosticsQueued = true;
      return;
    }
    diagnosticsRunning = true;
    void (async () => {
      await Promise.resolve();
      try {
        do {
          diagnosticsQueued = false;
          const all = queuedAll;
          const only = queuedSlug;
          queuedAll = false;
          queuedSlug = undefined;
          let diagnostics: Diagnostic[] = [];
          let resolved: ReturnType<typeof resolveDeck> | undefined;
          try {
            resolved = resolveDeck(deckDir);
            // Evaluate slide scripts off the event loop; lintDeck then reads the cache.
            await warmLintDeck(resolved);
            diagnostics = [...lintDeck(resolved)];
          } catch (error) {
            diagnostics = [watchErrorDiagnostic(error)];
          }
          if (visualEnabled && resolved) {
            try {
              const visual = await lintVisualDeck(resolved, {
                ...(!all && only ? { slug: only } : {}),
                ...(options.visualRunner ? { runner: options.visualRunner } : {}),
              });
              if (visual === null) {
                visualEnabled = false;
              } else {
                visualEnabled = true;
                diagnostics.push(...visual);
              }
            } catch (error) {
              diagnostics.push(watchErrorDiagnostic(error));
            }
          }
          hub.emit({ type: "diagnostics", diagnostics });
        } while (diagnosticsQueued && !closed);
      } finally {
        diagnosticsRunning = false;
      }
    })();
  };

  const synthVoice = createSerialTask(async () => {
    try {
      if (options.synthVoice) {
        await options.synthVoice();
        hub.emit({ type: "timeline" });
        return;
      }
      const { hasVoice } = await import("../core/voice.ts");
      if (!hasVoice(deckDir)) {
        return;
      }
      const { synthDeck } = await import("../voice/synth.ts");
      await synthDeck(deckDir);
      hub.emit({ type: "timeline" });
    } catch (error) {
      // Voice is optional: an engine that is not running is worth a line, not a stack trace.
      console.error(voiceFailureLine(error));
    }
  });

  /**
   * Create skeletons for sections without slide HTML. A script the author cannot parse yet is
   * reported by the diagnostics pass that follows, so the failure itself stays quiet here.
   */
  const syncScript = (options: { announceEmpty: boolean }): void => {
    let result: SyncResult = { created: [], updated: [], removed: [] };
    try {
      result = syncDeck(deckDir);
    } catch {
      // resolveDeck in emitDiagnostics reports the same error with its path and line.
    }
    // A sync event reloads the whole page, so new and refreshed slides need no reload-slide.
    lastSlides = listSlideMtimes(deckDir);
    const { created, updated } = result;
    // Removed slides go by slug, as when the author deletes one (see scan).
    const removed = result.removed.map((path) => basename(path, ".html"));
    if (created.length > 0 || updated.length > 0 || removed.length > 0 || options.announceEmpty) {
      hub.emit({
        type: "sync",
        created,
        ...(updated.length > 0 ? { updated } : {}),
        ...(removed.length > 0 ? { removed } : {}),
      });
    }
  };

  const scan = (): void => {
    if (closed) {
      return;
    }

    const scriptNow = mtime(scriptPath);
    if (scriptNow > lastScript) {
      lastScript = scriptNow;
      syncScript({ announceEmpty: true });
      emitDiagnostics();
      synthVoice();
    }

    const themeNow = mtime(themePath);
    if (themeNow > lastTheme) {
      lastTheme = themeNow;
      hub.emit({ type: "reload-theme" });
      emitDiagnostics();
    }

    const stylesNow = listSlideMtimes(deckDir, ".css");
    if (mtimesChanged(lastStyles, stylesNow)) {
      lastStyles = stylesNow;
      hub.emit({ type: "reload-theme" });
      emitDiagnostics();
    }

    // Slide scripts register once at page load, so a change reloads the page.
    const scriptsNow = listSlideMtimes(deckDir, ".ts");
    const scriptSlugs = changedKeys(lastScripts, scriptsNow);
    if (scriptSlugs.length > 0) {
      lastScripts = scriptsNow;
      hub.emit({ type: "reload-script", slugs: scriptSlugs });
      emitDiagnostics();
    }

    // dek does not load a `.js` script, but lint names it so the author can rename it.
    const javascriptNow = listSlideMtimes(deckDir, ".js");
    if (mtimesChanged(lastJavascript, javascriptNow)) {
      lastJavascript = javascriptNow;
      emitDiagnostics();
    }

    const slidesNow = listSlideMtimes(deckDir);
    const removed: string[] = [];
    for (const slug of Object.keys(lastSlides)) {
      if (!(slug in slidesNow)) {
        delete lastSlides[slug];
        removed.push(slug);
      }
    }
    if (removed.length > 0) {
      hub.emit({ type: "sync", created: [], removed });
    }
    for (const [slug, time] of Object.entries(slidesNow)) {
      const previous = lastSlides[slug] ?? 0;
      if (time > previous) {
        lastSlides[slug] = time;
        hub.emit({ type: "reload-slide", slug });
        emitDiagnostics(slug);
      }
    }

    const voiceNow = listVoiceMtimes(voiceDir);
    if (mtimesChanged(lastVoice, voiceNow)) {
      lastVoice = voiceNow;
      synthVoice();
    }
  };

  const schedule = (): void => {
    if (debounce) {
      clearTimeout(debounce);
    }
    debounce = setTimeout(scan, 20);
  };

  const watcher = watch(deckDir, { recursive: true }, () => {
    schedule();
  });
  let timer: ReturnType<typeof setInterval> | undefined;
  const startPoll = (ms: number): void => {
    if (timer || closed || ms <= 0) {
      return;
    }
    timer = startInterval(scan, ms);
  };
  startPoll(options.pollIntervalMs ?? POLL_INTERVAL_MS);
  if (typeof watcher.on === "function") {
    watcher.on("error", () => {
      startPoll(options.pollIntervalMs || POLL_INTERVAL_MS);
    });
  }
  // A script written before the server started still gets its skeletons.
  syncScript({ announceEmpty: false });
  emitDiagnostics();

  return {
    close() {
      closed = true;
      if (debounce) {
        clearTimeout(debounce);
      }
      if (timer) {
        stopInterval(timer);
      }
      watcher.close();
    },
  };
}

/** Mtimes of `slides/<slug><ext>`, keyed by slug; the same files lint and render read. */
function listSlideMtimes(
  deckDir: string,
  ext: ".html" | ".js" | SlideSidecar = ".html",
): Record<string, number> {
  return Object.fromEntries(
    listSlideFiles(deckDir, ext).map((file) => [file.slug, mtime(file.path)]),
  );
}

function listVoiceMtimes(dir: string): Record<string, number> {
  const times: Record<string, number> = {};
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

function mtimesChanged(previous: Record<string, number>, next: Record<string, number>): boolean {
  return changedKeys(previous, next).length > 0;
}

/** Keys whose mtime changed, including files added or removed. */
function changedKeys(previous: Record<string, number>, next: Record<string, number>): string[] {
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

/** A failed synthesis as one line on the server's stderr: what failed, then the fix. */
export function voiceFailureLine(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const hint = error instanceof DekError && error.hint ? ` (${error.hint})` : "";
  return `voice: ${message}${hint}`;
}

function watchErrorDiagnostic(error: unknown): Diagnostic {
  if (error instanceof DekError) {
    return errorDiagnostic("parse", {
      message: error.message,
      ...(error.path ? { path: error.path } : {}),
      ...(error.line !== undefined ? { line: error.line } : {}),
    });
  }
  return errorDiagnostic("error", {
    message: error instanceof Error ? error.message : String(error),
  });
}
