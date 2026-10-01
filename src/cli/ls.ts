import { type DekcConfig, loadConfig } from "../core/config.ts";
import type { Diagnostic } from "../core/diagnostic.ts";
import { lintDeck, lintProject } from "../core/lint.ts";
import { listSlides, type Project, type ProjectDeck } from "../core/resolve.ts";
import { slideVideoSeconds, timelineSeconds } from "../core/timeline.ts";
import { sectionTiming } from "../core/timing.ts";
import { tryLoadCachedTimeline } from "../core/voice.ts";
import { type SkippedCheck, skippedChecks } from "./result.ts";
import type { DecksTarget, RefInfo } from "./scope.ts";

export type LsListResult = {
  kind: "list";
  root: string;
  /** The project's own findings (dekc.toml), once: no deck's row repeats them. */
  diagnostics: Diagnostic[];
  decks: Array<{
    name: string;
    title: string;
    sections: number;
    slides: number;
    diagnostics: Diagnostic[];
  }>;
  failed: Array<{ name: string }>;
};

type LsSectionRow = {
  slug: string;
  title: string;
  beats: number;
  estimateSeconds: number;
  budgetSeconds?: number;
  videoSeconds?: number;
};

export type LsDeckResult = {
  kind: "deck";
  name: string;
  title: string;
  event?: string;
  date?: string;
  duration?: string;
  estimateSeconds: number;
  videoSeconds?: number;
  sections: LsSectionRow[];
  diagnostics: Diagnostic[];
  /** Lint is skipped for a ref: it is not yours to fix, so an empty list is not a pass. */
  skipped?: SkippedCheck[];
  /** Set when the deck is a ref. */
  ref?: RefInfo;
};

/** The one deck in scope, a ref included, or else every deck of the project. */
export function lsCommand(target: DecksTarget): LsListResult | LsDeckResult {
  const { project, deck, ref } = target;
  if (deck && ref) {
    return {
      ...formatDeck(deck, loadConfig(project.configPath), project, { lint: false }),
      ...skippedChecks([
        { check: "lint", reason: "a ref is read-only; its problems are not yours to fix" },
      ]),
      ref,
    };
  }
  if (deck) {
    return formatDeck(deck, loadConfig(project.configPath), project);
  }
  return {
    kind: "list",
    root: project.root,
    diagnostics: lintProject(project),
    decks: project.decks.map((entry) => summarizeDeck(entry, project)),
    failed: project.failed.map((entry) => ({ name: entry.name })),
  };
}

function summarizeDeck(deck: ProjectDeck, project: Project): LsListResult["decks"][number] {
  return {
    name: deck.name,
    title: deck.deck.title,
    sections: deck.deck.sections.length,
    slides: listSlides(deck.dir).length,
    diagnostics: lintDeck({ project, deck }),
  };
}

function formatDeck(
  deck: ProjectDeck,
  config: DekcConfig,
  project: Project,
  options: { lint: boolean } = { lint: true },
): LsDeckResult {
  const timing = sectionTiming(deck.deck.sections, deck.deck.duration, config);
  const estimateTotal = timing.reduce((sum, row) => sum + row.estimateSeconds, 0);
  const timeline = tryLoadCachedTimeline(deck.dir);

  return {
    kind: "deck",
    name: deck.name,
    title: deck.deck.title,
    ...(deck.deck.event ? { event: deck.deck.event } : {}),
    ...(deck.deck.date ? { date: deck.deck.date } : {}),
    ...(deck.deck.duration ? { duration: deck.deck.duration } : {}),
    estimateSeconds: estimateTotal,
    ...(timeline ? { videoSeconds: timelineSeconds(timeline) } : {}),
    sections: deck.deck.sections.map((section, index) => {
      const row = timing[index];
      const videoSeconds = timeline ? slideVideoSeconds(timeline, index) : undefined;
      return {
        slug: section.slug,
        title: section.title,
        beats: section.beats.length,
        estimateSeconds: row?.estimateSeconds ?? 0,
        ...(row?.budgetSeconds !== undefined ? { budgetSeconds: row.budgetSeconds } : {}),
        ...(videoSeconds !== undefined ? { videoSeconds } : {}),
      };
    }),
    diagnostics: options.lint ? lintDeck({ project, deck }) : [],
  };
}
