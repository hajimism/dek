import type { DekConfig } from "./config.ts";

type SectionBodies = {
  body: string;
  beats: Array<{ body: string }>;
};

function stripBlockquotes(markdown: string): string {
  return markdown
    .split(/\r?\n/)
    .filter((line) => !/^\s*>/.test(line))
    .join("\n");
}

export function joinSectionBodies(section: SectionBodies, separator: string): string {
  return [section.body, ...section.beats.map((beat) => beat.body)].filter(Boolean).join(separator);
}

export function speechText(section: SectionBodies): string {
  return joinSectionBodies(section, "\n");
}

export function formatSectionScript(section: SectionBodies): string {
  return joinSectionBodies(section, "\n\n");
}

function speechChars(text: string): number {
  return stripBlockquotes(text).replace(/\s+/g, "").length;
}

export function estimateSeconds(text: string, config: DekConfig): number {
  const stripped = stripBlockquotes(text);
  const cjk = [...stripped.matchAll(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu)]
    .length;
  const rest = stripped.replace(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu, " ");
  const words = rest.split(/\s+/).filter(Boolean).length;
  const cjkMinutes = config.cjkPerMinute > 0 ? cjk / config.cjkPerMinute : 0;
  const latinMinutes = config.latinPerMinute > 0 ? words / config.latinPerMinute : 0;
  return Math.round((cjkMinutes + latinMinutes) * 60);
}

export function parseDurationSeconds(duration?: string): number | undefined {
  if (!duration) {
    return undefined;
  }
  const match = duration.match(/^(\d+)m$/);
  if (!match) {
    return undefined;
  }
  return Number(match[1]) * 60;
}

export function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

export type TimedSection = {
  slug: string;
  estimateSeconds: number;
  budgetSeconds?: number;
};

export function sectionTiming(
  sections: Array<{ slug: string; body: string; beats: Array<{ body: string }> }>,
  duration: string | undefined,
  config: DekConfig,
): TimedSection[] {
  const rows = sections.map((section) => {
    const text = speechText(section);
    return {
      slug: section.slug,
      chars: speechChars(text),
      estimateSeconds: estimateSeconds(text, config),
    };
  });
  const totalChars = rows.reduce((sum, row) => sum + row.chars, 0);
  const durationSeconds = parseDurationSeconds(duration);

  return rows.map((row) => ({
    slug: row.slug,
    estimateSeconds: row.estimateSeconds,
    ...(durationSeconds !== undefined && totalChars > 0
      ? { budgetSeconds: Math.round((durationSeconds * row.chars) / totalChars) }
      : {}),
  }));
}
