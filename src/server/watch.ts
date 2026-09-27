import { existsSync, watch } from "node:fs";
import { basename } from "node:path";
import { type Diagnostic, errorDiagnostic } from "../core/diagnostic.ts";
import { DekError, errorFields } from "../core/error.ts";
import { lintDeckAsync, lintProject } from "../core/lint.ts";
import type { LiveEvent } from "../core/live-protocol.ts";
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

/**
 * Watch one deck and `emit` what its open pages must do: each scan diffs the deck's files
 * against the last scan (see `diffSnapshot`), then syncs, lints, and synthesizes as it says.
 */
export function watchDeck(
  deckDir: string,
  emit: (event: LiveEvent) => void,
  options: {
    visual?: boolean;
    visualRunner?: PlaywrightRunner;
    pollIntervalMs?: number;
    setInterval?: typeof setInterval;
    clearInterval?: typeof clearInterval;
    synthVoice?: () => Promise<void>;
  } = {},
): Stoppable {
  let snapshot = takeSnapshot(deckDir);
  let closed = false;
  let debounce: ReturnType<typeof setTimeout> | undefined;
  const startInterval = options.setInterval ?? setInterval;
  const stopInterval = options.clearInterval ?? clearInterval;

  // A browser that is not installed turns the visual pass off until one is found again.
  let visualEnabled = options.visual === true;
  const diagnose = async (scope: DiagnoseScope): Promise<Diagnostic[]> => {
    let diagnostics: Diagnostic[] = [];
    let resolved: ReturnType<typeof resolveDeck> | undefined;
    try {
      resolved = resolveDeck(deckDir);
      diagnostics = [...lintProject(resolved.project), ...(await lintDeckAsync(resolved))];
    } catch (error) {
      diagnostics = [watchErrorDiagnostic(error)];
    }
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

  // Edits that land while a pass runs are merged into one pass after it.
  let pending: DiagnoseScope | undefined;
  const runDiagnostics = createSerialTask(async () => {
    const scope = pending;
    pending = undefined;
    if (!scope || closed) {
      return;
    }
    const diagnostics = await diagnose(scope);
    if (!closed) {
      emit({ type: "diagnostics", diagnostics });
    }
  });
  const requestDiagnostics = (scope: DiagnoseScope): void => {
    pending = mergeScope(pending, scope);
    runDiagnostics();
  };

  const synthVoice = createSerialTask(async () => {
    try {
      if (options.synthVoice) {
        await options.synthVoice();
        emit({ type: "timeline" });
        return;
      }
      const { hasVoice } = await import("../core/voice.ts");
      if (!hasVoice(deckDir)) {
        return;
      }
      const { synthDeck } = await import("../voice/synth.ts");
      await synthDeck(deckDir);
      emit({ type: "timeline" });
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
      // resolveDeck in diagnose reports the same error with its path and line.
    }
    // A sync event reloads the whole page, so the slides it wrote need no reload-slide.
    snapshot = { ...snapshot, slides: slideMtimes(deckDir) };
    // Slides go by slug: the stream reaches the audience, and a path on disk names the
    // presenter's home and user.
    const slugs = (paths: string[]) => paths.map((path) => basename(path, ".html"));
    const created = slugs(result.created);
    const updated = slugs(result.updated);
    const removed = slugs(result.removed);
    if (created.length > 0 || updated.length > 0 || removed.length > 0 || options.announceEmpty) {
      emit({
        type: "sync",
        created,
        ...(updated.length > 0 ? { updated } : {}),
        ...(removed.length > 0 ? { removed } : {}),
      });
    }
  };

  const scanOnce = (): void => {
    const next = takeSnapshot(deckDir);
    const change = diffSnapshot(snapshot, next);
    snapshot = next;
    if (change.sync) {
      syncScript({ announceEmpty: true });
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

  const schedule = (): void => {
    if (debounce) {
      clearTimeout(debounce);
    }
    debounce = setTimeout(scan, 20);
  };

  const watcher = watch(deckDir, { recursive: true }, schedule);
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
  requestDiagnostics({});

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

/** A failed synthesis as one line on the server's stderr: what failed, then the fix. */
export function voiceFailureLine(error: unknown): string {
  const { message, hint } = errorFields(error);
  return `voice: ${message}${hint ? ` (${hint})` : ""}`;
}

/** A failure while watching, as the diagnostic a page shows: a DekError keeps its hint. */
export function watchErrorDiagnostic(error: unknown): Diagnostic {
  return errorDiagnostic(error instanceof DekError ? "parse" : "error", errorFields(error));
}
