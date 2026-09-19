import { type DekConfig, loadConfig } from "../core/config.ts";
import {
  type Diagnostic,
  lintDeck,
  listSlides,
  type Project,
  type ProjectDeck,
} from "../core/index.ts";
import { slideVideoSeconds, timelineSeconds } from "../core/timeline.ts";
import { sectionTiming } from "../core/timing.ts";
import { tryLoadCachedTimeline } from "../core/voice.ts";
import { requireDeck, resolveScope } from "./scope.ts";

export type LsListResult = {
  kind: "list";
  root: string;
  decks: Array<{
    name: string;
    title: string;
    sections: number;
    slides: number;
    diagnostics: Diagnostic[];
  }>;
  failed: Array<{ name: string }>;
};

export type LsSectionRow = {
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
};

export function lsCommand(options: {
  cwd: string;
  deck?: string;
  positionalDeck?: string;
}): LsListResult | LsDeckResult {
  const scope = resolveScope(options.cwd, {
    deck: options.deck,
    positionalDeck: options.positionalDeck,
  });

  if (options.deck || options.positionalDeck || scope.deck) {
    return formatDeck(
      requireDeck(scope, options.cwd),
      loadConfig(scope.project.configPath),
      scope.project,
    );
  }

  return {
    kind: "list",
    root: scope.project.root,
    decks: scope.project.decks.map((deck) => summarizeDeck(deck, scope.project)),
    failed: scope.project.failed.map((entry) => ({ name: entry.name })),
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

function formatDeck(deck: ProjectDeck, config: DekConfig, project: Project): LsDeckResult {
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
    diagnostics: lintDeck({ project, deck }),
  };
}
