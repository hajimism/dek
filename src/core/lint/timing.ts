import type { DekConfig } from "../config.ts";
import { type Diagnostic, diag } from "../diagnostic.ts";
import type { ProjectDeck } from "../resolve.ts";
import type { Timeline } from "../timeline.ts";
import { formatClock, parseDurationSeconds, sectionTiming } from "../timing.ts";
import { tryLoadCachedTimeline } from "../voice.ts";
import type { LintContext } from "./context.ts";

const DURATION_DRIFT_RATIO = 0.2;
/** The reading-time estimate leaves out pauses and demos, so it gets more room than a Timeline. */
const ESTIMATE_DRIFT_RATIO = 0.35;

/** DEK041 against the voice timeline when there is one, else against the reading-time estimate. */
export function timingDiagnostics(ctx: LintContext): Diagnostic[] {
  const timeline = tryLoadCachedTimeline(ctx.deck.dir);
  return timeline ? lintDuration(ctx.deck, timeline) : lintEstimate(ctx.deck, ctx.config);
}

function lintDuration(deck: ProjectDeck, timeline: Timeline): Diagnostic[] {
  const budget = parseDurationSeconds(deck.deck.duration);
  if (budget === undefined || budget <= 0) {
    return [];
  }
  const actual = timeline.durationMs / 1000;
  const drift = Math.abs(actual - budget) / budget;
  if (drift < DURATION_DRIFT_RATIO) {
    return [];
  }
  return [
    diag("DEK041", {
      message: `video duration ${Math.round(actual)}s differs from budget ${deck.deck.duration} by more than ${Math.round(DURATION_DRIFT_RATIO * 100)}%`,
      path: deck.scriptPath,
      hint: durationHint(actual < budget),
      data: { actualSeconds: Math.round(actual), budgetSeconds: budget, source: "timeline" },
    }),
  ];
}

/** DEK041 before any voice: the reading-time estimate `dek ls` shows, against the budget. */
function lintEstimate(deck: ProjectDeck, config: DekConfig): Diagnostic[] {
  const budget = parseDurationSeconds(deck.deck.duration);
  if (budget === undefined || budget <= 0) {
    return [];
  }
  const estimate = sectionTiming(deck.deck.sections, deck.deck.duration, config).reduce(
    (sum, row) => sum + row.estimateSeconds,
    0,
  );
  if (Math.abs(estimate - budget) / budget < ESTIMATE_DRIFT_RATIO) {
    return [];
  }
  return [
    diag("DEK041", {
      message: `the script reads in about ${formatClock(estimate)}, budget ${deck.deck.duration}; more than ${Math.round(ESTIMATE_DRIFT_RATIO * 100)}% apart`,
      path: deck.scriptPath,
      hint: durationHint(estimate < budget),
      data: { actualSeconds: estimate, budgetSeconds: budget, source: "estimate" },
    }),
  ];
}

function durationHint(short: boolean): string {
  return short
    ? "write more for the slot, or shorten duration in the frontmatter"
    : "cut the script, or lengthen duration in the frontmatter";
}
