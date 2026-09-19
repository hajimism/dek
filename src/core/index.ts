export {
  applyDict,
  type Cue,
  cuesFromDeck,
  splitSentences,
  spokenParagraphs,
  unknownAsciiWords,
  type VoiceDict,
} from "./cue.ts";
export type { Diagnostic, RuleId } from "./diagnostic.ts";
export { DekError } from "./error.ts";
export { DURATION_DRIFT_RATIO, lintDeck } from "./lint.ts";
export { parseScript } from "./parse.ts";
export {
  asResolvedDeck,
  listSlides,
  type Project,
  type ProjectDeck,
  type ResolvedDeck,
  requireSection,
  resolveDeck,
  resolveProject,
} from "./resolve.ts";
export * from "./schema.ts";
export type { Position } from "./step.ts";
export { type SyncResult, syncDeck, writeFrontmatterSchema } from "./sync.ts";
export {
  buildTimeline,
  type PauseConfig,
  playbackSchedule,
  scheduleVoice,
  sliceTimeline,
  slideTimeRange,
  slideVideoSeconds,
  type Timeline,
  type TimelineBeat,
  type TimelineSentence,
  timelineSeconds,
  type Utterance,
  type VoiceSchedule,
} from "./timeline.ts";
