import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DekError } from "./error.ts";
import { joinLines, splitLines } from "./lines.ts";
import { asResolvedDeck, type ResolvedDeck, requireSection, SLIDE_SIDECARS } from "./resolve.ts";
import { Id } from "./schema.ts";
import { renameTableKeys } from "./toml-keys.ts";
import { voiceDir } from "./voice.ts";

export function renameSection(dir: string, from: string, to: string): void;
export function renameSection(source: ResolvedDeck, from: string, to: string): void;
export function renameSection(input: string | ResolvedDeck, from: string, to: string): void {
  if (!Id.safeParse(to).success) {
    throw new DekError(`invalid id "${to}"`, { hint: "use [a-z0-9-] with at least one letter" });
  }
  const { deck } = asResolvedDeck(input);
  const section = requireSection(deck, from);
  if (deck.deck.sections.some((entry) => entry.slug === to)) {
    throw new DekError(`section "${to}" already exists`, {
      path: deck.scriptPath,
      hint: "run `dek ls`",
    });
  }

  const source = readFileSync(deck.scriptPath, "utf8");
  const lines = splitLines(source);
  const headingIndex = section.line - 1;
  const heading = lines[headingIndex];
  if (heading === undefined) {
    throw new DekError(`section "${from}" heading not found`, {
      path: deck.scriptPath,
      hint: "run `dek ls`",
    });
  }
  lines[headingIndex] = rewriteHeadingId(heading, from, to);

  const fromPath = join(deck.dir, "slides", `${from}.html`);
  const toPath = join(deck.dir, "slides", `${to}.html`);
  for (const target of [
    toPath,
    ...SLIDE_SIDECARS.map((ext) => join(deck.dir, "slides", `${to}${ext}`)),
  ]) {
    if (existsSync(target)) {
      throw new DekError(`slide "${to}" already exists`, {
        path: target,
        hint: "run `dek ls`",
      });
    }
  }

  // Everything that could refuse is worked out before the first file changes.
  const voice = planVoiceBeatKeys(deck.dir, from, to);
  const steps: FileStep[] = [writeStep(deck.scriptPath, source, joinLines(source, lines))];
  if (existsSync(fromPath)) {
    steps.push(renameStep(fromPath, toPath));
    const html = readFileSync(fromPath, "utf8");
    const next = html.replaceAll(`data-slug="${from}"`, `data-slug="${to}"`);
    if (next !== html) {
      steps.push(writeStep(toPath, html, next));
    }
  }
  for (const ext of SLIDE_SIDECARS) {
    const sidecar = join(deck.dir, "slides", `${from}${ext}`);
    if (existsSync(sidecar)) {
      steps.push(renameStep(sidecar, join(deck.dir, "slides", `${to}${ext}`)));
    }
  }
  if (voice) {
    steps.push(writeStep(voice.path, voice.source, voice.next));
  }
  applySteps(steps);
}

/** One file change `dek mv` makes, with how to take it back. */
type FileStep = { path: string; apply: () => void; undo: () => void };

function writeStep(path: string, before: string, after: string): FileStep {
  return {
    path,
    apply: () => writeFileSync(path, after),
    undo: () => writeFileSync(path, before),
  };
}

function renameStep(from: string, to: string): FileStep {
  return { path: to, apply: () => renameSync(from, to), undo: () => renameSync(to, from) };
}

/** Applies every step, or none: a failure takes back the steps already applied. */
function applySteps(steps: FileStep[]): void {
  const done: FileStep[] = [];
  try {
    for (const step of steps) {
      step.apply();
      done.push(step);
    }
  } catch (error) {
    const stuck: string[] = [];
    for (const step of done.reverse()) {
      try {
        step.undo();
      } catch {
        stuck.push(step.path);
      }
    }
    if (stuck.length > 0) {
      throw new DekError(`dek mv failed and could not restore ${stuck.join(", ")}`, {
        cause: error,
        hint: "check these files by hand",
      });
    }
    throw error;
  }
}

/**
 * The voice.toml with its `[beats]` keys (`slug`, `"slug/beat"`) pointing at
 * the renamed slide, or undefined when nothing changes. The rewrite is checked
 * against the parsed file, so a layout it cannot rewrite stops the rename.
 */
function planVoiceBeatKeys(
  deckDir: string,
  from: string,
  to: string,
): { path: string; source: string; next: string } | undefined {
  const path = join(voiceDir(deckDir), "voice.toml");
  if (!existsSync(path)) {
    return undefined;
  }
  const source = readFileSync(path, "utf8");
  let parsed: Record<string, unknown>;
  try {
    parsed = Bun.TOML.parse(source) as Record<string, unknown>;
  } catch {
    // An unreadable voice.toml is the voice loader's to report, not mv's.
    return undefined;
  }
  const beats = parsed.beats;
  if (beats === null || typeof beats !== "object") {
    return undefined;
  }
  const rename = (key: string): string | undefined => renameBeatKey(key, from, to);
  const expected = {
    ...parsed,
    beats: Object.fromEntries(
      Object.entries(beats).map(([key, value]) => [rename(key) ?? key, value]),
    ),
  };
  const next = renameTableKeys(source, "beats", rename);
  let actual: unknown;
  try {
    actual = Bun.TOML.parse(next);
  } catch {
    actual = undefined;
  }
  if (!Bun.deepEquals(actual, expected, true)) {
    throw new DekError(`cannot rewrite the [beats] keys for "${from}" in voice.toml`, {
      path,
      hint: `write them as [beats."${from}/…"] tables or dotted keys, or rename them to "${to}" by hand`,
    });
  }
  return next === source ? undefined : { path, source, next };
}

/** `slug` or `slug/beat` for the renamed slide, else undefined. */
function renameBeatKey(key: string, from: string, to: string): string | undefined {
  const slash = key.indexOf("/");
  const slug = slash < 0 ? key : key.slice(0, slash);
  return slug === from ? `${to}${slash < 0 ? "" : key.slice(slash)}` : undefined;
}

export function reorderSection(
  dir: string,
  slug: string,
  options: { before?: string; after?: string },
): void;
export function reorderSection(
  source: ResolvedDeck,
  slug: string,
  options: { before?: string; after?: string },
): void;
export function reorderSection(
  input: string | ResolvedDeck,
  slug: string,
  options: { before?: string; after?: string },
): void {
  const target = options.before ?? options.after;
  if (!target) {
    throw new DekError("use --before or --after", {
      hint: "usage: dek mv <slug> --before|--after <slug>",
    });
  }
  if (options.before && options.after) {
    throw new DekError("use only one of --before or --after", {
      hint: "usage: dek mv <slug> --before|--after <slug>",
    });
  }

  const { deck } = asResolvedDeck(input);
  const sections = deck.deck.sections;
  const fromIndex = sections.findIndex((entry) => entry.slug === slug);
  if (fromIndex < 0) {
    requireSection(deck, slug);
  }
  const targetIndex = sections.findIndex((entry) => entry.slug === target);
  if (targetIndex < 0) {
    requireSection(deck, target);
  }

  const source = readFileSync(deck.scriptPath, "utf8");
  const lines = splitLines(source);
  const firstLine = sections[0]?.line;
  if (firstLine === undefined) {
    return;
  }
  const head = lines.slice(0, firstLine - 1);
  const chunks = sections.map((section, index) => {
    const start = section.line - 1;
    const end = sections[index + 1]
      ? (sections[index + 1]?.line ?? lines.length) - 1
      : lines.length;
    return lines.slice(start, end);
  });

  const moved = chunks.splice(fromIndex, 1)[0];
  if (!moved) {
    return;
  }
  const remainingTarget = chunks.findIndex((_, index) => {
    const original = index < fromIndex ? index : index + 1;
    return original === targetIndex;
  });
  const insertAt = options.before ? remainingTarget : remainingTarget + 1;
  chunks.splice(insertAt, 0, moved);
  writeFileSync(deck.scriptPath, joinLines(source, [...head, ...chunks.flat()]));
}

function rewriteHeadingId(heading: string, from: string, to: string): string {
  const attr = new RegExp(`\\{#${escapeRegex(from)}\\}`);
  if (attr.test(heading)) {
    return heading.replace(attr, `{#${to}}`);
  }
  return `${heading} {#${to}}`;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
