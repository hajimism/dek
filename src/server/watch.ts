import { existsSync, readdirSync, statSync, watch } from "node:fs";
import { join } from "node:path";
import type { Diagnostic } from "../core/diagnostic.ts";
import { lintDeck, resolveDeck, syncDeck } from "../core/index.ts";
import type { PlaywrightRunner } from "../core/playwright.ts";
import { lintVisualDeck } from "../core/visual.ts";
import type { EventHub } from "./hub.ts";
import { createSerialTask } from "./serial.ts";

export type Stoppable = { close: () => void };

export function watchDeck(
  deckDir: string,
  hub: EventHub,
  options: {
    visualRunner?: PlaywrightRunner;
    pollIntervalMs?: number;
    setInterval?: typeof setInterval;
    clearInterval?: typeof clearInterval;
    synthVoice?: () => Promise<void>;
  } = {},
): Stoppable {
  const scriptPath = join(deckDir, "script.md");
  const themePath = join(deckDir, "theme.css");
  const slidesDir = join(deckDir, "slides");
  let lastScript = mtime(scriptPath);
  let lastTheme = mtime(themePath);
  let lastSlides = listSlideMtimes(slidesDir);
  const voiceDir = join(deckDir, "voice");
  let lastVoice = listVoiceMtimes(voiceDir);
  let closed = false;
  let debounce: ReturnType<typeof setTimeout> | undefined;
  const startInterval = options.setInterval ?? setInterval;
  const stopInterval = options.clearInterval ?? clearInterval;

  let visualEnabled: boolean | undefined;
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
            diagnostics = [...lintDeck(resolved)];
          } catch (error) {
            console.error(error);
          }
          if (visualEnabled !== false) {
            try {
              const visual = await lintVisualDeck(deckDir, {
                ...(!all && only ? { slug: only } : {}),
                ...(options.visualRunner ? { runner: options.visualRunner } : {}),
                ...(resolved ? { deck: resolved.deck } : {}),
              });
              if (visual === null) {
                visualEnabled = false;
              } else {
                visualEnabled = true;
                diagnostics.push(...visual);
              }
            } catch (error) {
              console.error(error);
              visualEnabled = false;
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
      console.error(error);
    }
  });

  const scan = (): void => {
    if (closed) {
      return;
    }

    const scriptNow = mtime(scriptPath);
    if (scriptNow > lastScript) {
      lastScript = scriptNow;
      try {
        const result = syncDeck(deckDir);
        lastSlides = listSlideMtimes(slidesDir);
        hub.emit({ type: "sync", created: result.created });
      } catch (error) {
        console.error(error);
        hub.emit({ type: "sync", created: [] });
      }
      emitDiagnostics();
      synthVoice();
    }

    const themeNow = mtime(themePath);
    if (themeNow > lastTheme) {
      lastTheme = themeNow;
      hub.emit({ type: "reload-theme" });
      emitDiagnostics();
    }

    const slidesNow = listSlideMtimes(slidesDir);
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
  startPoll(options.pollIntervalMs ?? 2000);
  if (typeof watcher.on === "function") {
    watcher.on("error", () => {
      startPoll(options.pollIntervalMs || 2000);
    });
  }
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

function listSlideMtimes(slidesDir: string): Record<string, number> {
  const times: Record<string, number> = {};
  if (!existsSync(slidesDir)) {
    return times;
  }
  for (const name of readdirSync(slidesDir)) {
    if (!name.endsWith(".html")) {
      continue;
    }
    times[name.slice(0, -".html".length)] = mtime(join(slidesDir, name));
  }
  return times;
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
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
  for (const key of keys) {
    if ((previous[key] ?? 0) !== (next[key] ?? 0)) {
      return true;
    }
  }
  return false;
}

function mtime(path: string): number {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return 0;
  }
}
