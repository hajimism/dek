import { watch } from "node:fs";
import { join } from "node:path";
import type { LiveEvent } from "../core/live-protocol.ts";
import type { PlaywrightRunner } from "../core/playwright.ts";
import { type Project, resolveProject } from "../core/resolve.ts";
import { createEventHub, type DeckEvent, type EventHub } from "./hub.ts";
import { type Stoppable, watchDeck } from "./watch.ts";

export type ProjectWatch = {
  /** The project as last read: re-read after a sync, so decks that come and go show. */
  project(): Project;
  /** Every event the decks' watchers emit, each with its deck. */
  hub: EventHub;
  /** Stop every watcher, then end the event stream. */
  close(): void;
};

/**
 * Watch the decks a server serves: the one it is scoped to, or every deck of the project and
 * the decks directory for decks that come and go. `onChange` runs whenever what a page shows
 * may have changed: after each event but diagnostics and the timeline, and when the deck set does.
 */
export function createProjectWatch(options: {
  root: string;
  project: Project;
  scopedDeckName?: string;
  visual: boolean;
  visualRunner?: PlaywrightRunner;
  pollIntervalMs: number;
  onChange: () => void;
}): ProjectWatch {
  const { root, scopedDeckName } = options;
  let project = options.project;
  let stopped = false;
  const hub = createEventHub();
  const watchers = new Map<string, Stoppable>();
  const watchOptions = {
    visual: options.visual,
    visualRunner: options.visualRunner,
    pollIntervalMs: options.pollIntervalMs,
  };

  /** Bring the server up to date before any page hears the event and asks for what changed. */
  const emit = (event: DeckEvent): void => {
    if (event.type === "sync") {
      refreshProject();
    }
    if (event.type !== "diagnostics" && event.type !== "timeline") {
      options.onChange();
    }
    hub.emit(event);
  };

  const reconcileWatchers = (): void => {
    const targets = scopedDeckName
      ? new Map([[join(project.root, "decks", scopedDeckName), scopedDeckName]])
      : watchTargets(project);
    for (const [dir, deck] of targets) {
      if (!watchers.has(dir)) {
        const emitFor = (event: LiveEvent) => emit({ ...event, deck });
        watchers.set(dir, watchDeck(dir, emitFor, watchOptions));
      }
    }
    for (const [dir, watcher] of watchers) {
      if (!targets.has(dir)) {
        watcher.close();
        watchers.delete(dir);
      }
    }
  };

  /** Re-read the project after decks come and go; the index lists the deck set. */
  const refreshProject = (): void => {
    // fs.watch can deliver an event after close; a watcher made then would outlive the server.
    if (stopped) {
      return;
    }
    try {
      const fresh = resolveProject(root);
      const changed = deckNames(fresh) !== deckNames(project);
      project = fresh;
      if (changed) {
        options.onChange();
      }
      reconcileWatchers();
    } catch {
      // dek.toml may disappear mid-write; keep the last known project.
    }
  };

  reconcileWatchers();
  let decksDirWatcher: Stoppable | undefined;
  if (!scopedDeckName) {
    try {
      const dirWatcher = watch(join(project.root, "decks"), { recursive: true }, refreshProject);
      const timer = setInterval(refreshProject, options.pollIntervalMs);
      decksDirWatcher = {
        close() {
          dirWatcher.close();
          clearInterval(timer);
        },
      };
    } catch {
      decksDirWatcher = undefined;
    }
  }

  return {
    project: () => project,
    hub,
    close() {
      stopped = true;
      for (const watcher of watchers.values()) {
        watcher.close();
      }
      decksDirWatcher?.close();
      hub.close();
    },
  };
}

/** The decks to watch, parsed or not: each deck's name by its directory. */
export function watchTargets(project: {
  decks: Array<{ name: string; dir: string }>;
  failed: Array<{ name: string; dir: string }>;
}): Map<string, string> {
  const targets = new Map<string, string>();
  for (const { name, dir } of [...project.decks, ...project.failed]) {
    if (!targets.has(dir)) {
      targets.set(dir, name);
    }
  }
  return targets;
}

/** Every deck name the index lists, parsed or not, as one comparable key. */
function deckNames(project: Project): string {
  return [...project.decks, ...project.failed]
    .map((entry) => entry.name)
    .sort()
    .join("\n");
}
