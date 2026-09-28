import { existsSync, watch } from "node:fs";
import { basename } from "node:path";
import { deckPaths } from "../core/deck-paths.ts";
import { type Diagnostic, errorDiagnostic } from "../core/diagnostic.ts";
import { DekError, errorFields } from "../core/error.ts";
import { lintDeckAsync, lintProject, unreadableScriptDiagnostics } from "../core/lint.ts";
import type { LiveEvent } from "../core/live-protocol.ts";
import { ScriptError } from "../core/parse.ts";
import type { PlaywrightRunner } from "../core/playwright.ts";
import { resolveDeck } from "../core/resolve.ts";
import { type SyncResult, syncDeck } from "../core/sync.ts";
import { lintVisualDeck } from "../core/visual.ts";
import {
  type DiagnoseScope,
  diffSnapshot,
  mergeScope,
  slideMtimes,
  takeSnapshot,
} from "./deck-snapshot.ts";
import { createSerialTask } from "./serial.ts";

export type Stoppable = { close: () => void };

/** How often a watcher re-scans for edits fs.watch missed; shared by the deck and project polls. */
export const POLL_INTERVAL_MS = 2000;

type WatchDeckOptions = {
  visual?: boolean;
  visualRunner?: PlaywrightRunner;
  pollIntervalMs?: number;
  setInterval?: typeof setInterval;
  clearInterval?: typeof clearInterval;
  synthVoice?: () => Promise<void>;
};

/**
 * Watch one deck and `emit` what its open pages must do: each scan diffs the deck's files
 * against the last scan (see `diffSnapshot`), then syncs, lints, and synthesizes as it says.
 */
export function watchDeck(
  deckDir: string,
  emit: (event: LiveEvent) => void,
  options: WatchDeckOptions = {},
): Stoppable {
  let snapshot = takeSnapshot(deckDir);
  let closed = false;
  const isClosed = () => closed;
  const diagnose = createDiagnose(deckDir, options);
  const requestDiagnostics = createDiagnosticsQueue(diagnose, emit, isClosed);
  const synthVoice = createVoiceSynth(deckDir, emit, isClosed, options.synthVoice);

  const syncScript = (announceEmpty: boolean): void => {
    const event = syncEvent(syncQuietly(deckDir), announceEmpty);
    // A sync event reloads the whole page, so the slides it wrote need no reload-slide.
    snapshot = { ...snapshot, slides: slideMtimes(deckDir) };
    if (event) {
      emit(event);
    }
  };

  const scanOnce = (): void => {
    const next = takeSnapshot(deckDir);
    const change = diffSnapshot(snapshot, next);
    snapshot = next;
    if (change.sync) {
      syncScript(true);
    }
    for (const event of change.events) {
      emit(event);
    }
    if (change.diagnose) {
      requestDiagnostics(change.diagnose);
    }
    if (change.synth) {
      synthVoice();
    }
  };

  const scan = (): void => {
    if (closed) {
      return;
    }
    // A scan runs from a timer, where a throw would end the server: a folder that turned into a
    // link out of the project, or one deleted between the listing and the read, is reported.
    try {
      scanOnce();
    } catch (error) {
      if (!closed && existsSync(deckDir)) {
        emit({ type: "diagnostics", diagnostics: [watchErrorDiagnostic(error)] });
      }
    }
  };

  const triggers = startScanTriggers(deckDir, scan, options, isClosed);
  // A script written before the server started still gets its skeletons.
  syncScript(false);
  requestDiagnostics({});

  return {
    close() {
      closed = true;
      triggers.close();
    },
  };
}

/**
 * Run `scan` shortly after fs.watch reports an edit, and on a poll for the edits it misses; a
 * watcher that fails turns the poll on even when it was off.
 */
function startScanTriggers(
  deckDir: string,
  scan: () => void,
  options: WatchDeckOptions,
  isClosed: () => boolean,
): Stoppable {
  const startInterval = options.setInterval ?? setInterval;
  const stopInterval = options.clearInterval ?? clearInterval;
  let debounce: ReturnType<typeof setTimeout> | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;

  const schedule = (): void => {
    if (debounce) {
      clearTimeout(debounce);
    }
    debounce = setTimeout(scan, 20);
  };
  const startPoll = (ms: number): void => {
    if (timer || isClosed() || ms <= 0) {
      return;
    }
    timer = startInterval(scan, ms);
  };

  const watcher = watch(deckDir, { recursive: true }, schedule);
  startPoll(options.pollIntervalMs ?? POLL_INTERVAL_MS);
  if (typeof watcher.on === "function") {
    watcher.on("error", () => {
      startPoll(options.pollIntervalMs || POLL_INTERVAL_MS);
    });
  }

  return {
    close() {
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

/** One diagnostics pass over the deck: the lint rules, then the visual pass when it is on. */
function createDiagnose(
  deckDir: string,
  options: WatchDeckOptions,
): (scope: DiagnoseScope) => Promise<Diagnostic[]> {
  // A browser that is not installed turns the visual pass off until one is found again.
  let visualEnabled = options.visual === true;
  return async (scope) => {
    const { diagnostics, resolved } = await lintPass(deckDir);
    if (visualEnabled && resolved) {
      try {
        const visual = await lintVisualDeck(resolved, {
          ...(scope.slug !== undefined ? { slug: scope.slug } : {}),
          ...(options.visualRunner ? { runner: options.visualRunner } : {}),
        });
        visualEnabled = visual !== null;
        diagnostics.push(...(visual ?? []));
      } catch (error) {
        diagnostics.push(watchErrorDiagnostic(error));
      }
    }
    return diagnostics;
  };
}

/** The lint rules over the deck, and the deck as resolved when it resolves. */
async function lintPass(
  deckDir: string,
): Promise<{ diagnostics: Diagnostic[]; resolved?: ReturnType<typeof resolveDeck> }> {
  let resolved: ReturnType<typeof resolveDeck> | undefined;
  try {
    resolved = resolveDeck(deckDir);
    return {
      diagnostics: [...lintProject(resolved.project), ...(await lintDeckAsync(resolved))],
      resolved,
    };
  } catch (error) {
    // A script that does not read says every reason at once, as lint does.
    const diagnostics =
      error instanceof ScriptError
        ? unreadableScriptDiagnostics({ scriptPath: deckPaths(deckDir).script, error })
        : [watchErrorDiagnostic(error)];
    // A deck that resolved but failed to lint still gets its visual pass.
    return { diagnostics, ...(resolved ? { resolved } : {}) };
  }
}

/** Run one diagnostics pass at a time and `emit` what each finds, unless the watch closed. */
function createDiagnosticsQueue(
  diagnose: (scope: DiagnoseScope) => Promise<Diagnostic[]>,
  emit: (event: LiveEvent) => void,
  isClosed: () => boolean,
): (scope: DiagnoseScope) => void {
  // Edits that land while a pass runs are merged into one pass after it.
  let pending: DiagnoseScope | undefined;
  const run = createSerialTask(async () => {
    const scope = pending;
    pending = undefined;
    if (!scope || isClosed()) {
      return;
    }
    const diagnostics = await diagnose(scope);
    if (!isClosed()) {
      emit({ type: "diagnostics", diagnostics });
    }
  });
  return (scope) => {
    pending = mergeScope(pending, scope);
    run();
  };
}

/** Synthesize the deck's voice, one run at a time, and tell its pages the timeline changed. */
function createVoiceSynth(
  deckDir: string,
  emit: (event: LiveEvent) => void,
  isClosed: () => boolean,
  synthVoice: (() => Promise<void>) | undefined,
): () => void {
  const synth = async (): Promise<boolean> => {
    if (synthVoice) {
      await synthVoice();
      return true;
    }
    const { hasVoice } = await import("../core/voice.ts");
    if (!hasVoice(deckDir)) {
      return false;
    }
    const { synthDeck } = await import("../voice/synth.ts");
    await synthDeck(deckDir);
    return true;
  };
  return createSerialTask(async () => {
    try {
      // A synthesis that outlives the watch has no pages left to tell.
      if ((await synth()) && !isClosed()) {
        emit({ type: "timeline" });
      }
    } catch (error) {
      // Voice is optional: an engine that is not running is worth a line, not a stack trace.
      console.error(voiceFailureLine(error));
    }
  });
}

/**
 * Create skeletons for sections without slide HTML. A script the author cannot parse yet is
 * reported by the diagnostics pass that follows, so the failure itself stays quiet here.
 */
function syncQuietly(deckDir: string): SyncResult {
  try {
    return syncDeck(deckDir);
  } catch {
    // resolveDeck in diagnose reports the same error with its path and line.
    return { created: [], updated: [], removed: [], dekFiles: { created: [], updated: [] } };
  }
}

/** The sync event a page hears, or none when nothing changed and none is owed. */
function syncEvent(result: SyncResult, announceEmpty: boolean): LiveEvent | undefined {
  // Slides go by slug: the stream reaches the audience, and a path on disk names the
  // presenter's home and user.
  const slugs = (paths: string[]) => paths.map((path) => basename(path, ".html"));
  const created = slugs(result.created);
  const updated = slugs(result.updated);
  const removed = slugs(result.removed);
  if (created.length === 0 && updated.length === 0 && removed.length === 0 && !announceEmpty) {
    return undefined;
  }
  return {
    type: "sync",
    created,
    ...(updated.length > 0 ? { updated } : {}),
    ...(removed.length > 0 ? { removed } : {}),
  };
}

/** A failed synthesis as one line on the server's stderr: what failed, then the fix. */
export function voiceFailureLine(error: unknown): string {
  const { message, hint } = errorFields(error);
  return `voice: ${message}${hint ? ` (${hint})` : ""}`;
}

/** A failure while watching, as the diagnostic a page shows: a DekError keeps its hint. */
export function watchErrorDiagnostic(error: unknown): Diagnostic {
  return errorDiagnostic(error instanceof DekError ? "parse" : "error", errorFields(error));
}
