import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { deckPaths } from "./deck-paths.ts";
import { DekError } from "./error.ts";
import { escapeRegExp } from "./escape.ts";
import { joinLines, sectionChunks, splitLines } from "./lines.ts";
import { asResolvedDeck, type ResolvedDeck, requireSection, SLIDE_SIDECARS } from "./resolve.ts";
import { Id } from "./schema.ts";
import { deckLayouts, skeletonHtml } from "./skeleton.ts";
import { skeletonRecord } from "./skeleton-record.ts";
import { renameTableKeys } from "./toml-keys.ts";

export function renameSection(dir: string, from: string, to: string): void;
export function renameSection(source: ResolvedDeck, from: string, to: string): void;
export function renameSection(input: string | ResolvedDeck, from: string, to: string): void {
  if (!Id.safeParse(to).success) {
    throw new DekError(`invalid id "${to}"`, { hint: "use [a-z0-9-] with at least one letter" });
  }
  const { deck } = asResolvedDeck(input);
  const has = (slug: string): boolean => deck.deck.sections.some((entry) => entry.slug === slug);
  if (!has(from) && has(to)) {
    // script.md was edited first; only the files still carry the old id.
    const steps = slideFileSteps(deck, from, to);
    if (steps.length === 0 && !existsSync(deckPaths(deck.dir).slide(to, ".html"))) {
      throw new DekError(`slide "${from}" not found`, {
        path: deckPaths(deck.dir).slide(from, ".html"),
        hint: "run `dek lint` to see which slides have no section",
      });
    }
    applySteps(steps);
    return;
  }
  const section = requireSection(deck, from);
  if (has(to)) {
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
  applySteps([
    writeStep(deck.scriptPath, source, joinLines(source, lines)),
    ...slideFileSteps(deck, from, to),
  ]);
}

/**
 * The steps that leave `slides/<to>.*` holding the slide and voice.toml pointing at it, from
 * whichever files the author already moved. Each file is settled on its own: one that is only at
 * `<from>` moves, one already at `<to>` stays, and a skeleton dek wrote gives way to the author's
 * file on the other side, as the dev server writes one for any id the script names. Only two files
 * the author wrote, one under each id, stop the rename; everything that could stop it is worked
 * out before any file changes.
 */
function slideFileSteps(deck: ResolvedDeck["deck"], from: string, to: string): FileStep[] {
  const paths = deckPaths(deck.dir);
  const layouts = deckLayouts(deck.dir);
  const record = skeletonRecord(deck.dir);
  const read = (slug: string): SlideFile | undefined => {
    const path = paths.slide(slug, ".html");
    if (!existsSync(path)) {
      return undefined;
    }
    const html = readFileSync(path, "utf8");
    return { path, html, authored: !record.owns(html, skeletonHtml(deck.deck, slug, layouts)) };
  };
  const source = read(from);
  const target = read(to);
  if (source?.authored && target?.authored) {
    throw bothHold(source.path, target.path, from, to);
  }
  for (const ext of SLIDE_SIDECARS) {
    if (existsSync(paths.slide(from, ext)) && existsSync(paths.slide(to, ext))) {
      throw bothHold(paths.slide(from, ext), paths.slide(to, ext), from, to);
    }
  }

  const voice = planVoiceBeatKeys(deck.dir, from, to);
  const steps: FileStep[] = [];
  // The HTML that ends up at <to>: the author's, wherever it is; else whichever is there.
  const toPath = paths.slide(to, ".html");
  const kept = source && (source.authored || !target) ? source : target;
  if (source && kept === source) {
    steps.push(
      target ? writeStep(toPath, target.html, source.html) : renameStep(source.path, toPath),
    );
  }
  if (source && target) {
    steps.push(removeStep(source.path, source.html));
  }
  if (kept) {
    const next = relabel(kept.html, from, to);
    if (next !== kept.html) {
      steps.push(writeStep(toPath, kept.html, next));
    }
  }
  for (const ext of SLIDE_SIDECARS) {
    const sidecar = paths.slide(from, ext);
    if (existsSync(sidecar)) {
      steps.push(renameStep(sidecar, paths.slide(to, ext)));
    }
  }
  if (voice) {
    steps.push(writeStep(voice.path, voice.source, voice.next));
  }
  return steps;
}

/** A slide's HTML under one id, and whether the author wrote it rather than dek. */
type SlideFile = { path: string; html: string; authored: boolean };

/** A slide's own `data-slug`, pointed at its new id. */
function relabel(html: string, from: string, to: string): string {
  return html.replaceAll(`data-slug="${from}"`, `data-slug="${to}"`);
}

function bothHold(fromPath: string, toPath: string, from: string, to: string): DekError {
  const fromName = `slides/${basename(fromPath)}`;
  const toName = `slides/${basename(toPath)}`;
  const what = fromPath.endsWith(".html") ? "hold a slide you wrote" : "exist";
  return new DekError(`${fromName} and ${toName} both ${what}`, {
    path: fromPath,
    hint: `merge them into ${toName} and remove ${fromName}, then run \`dek mv ${from} ${to}\` again`,
  });
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

function removeStep(path: string, before: string): FileStep {
  return { path, apply: () => unlinkSync(path), undo: () => writeFileSync(path, before) };
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
  const path = deckPaths(deckDir).voiceToml;
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

/** Where a moved section lands: right before one section, or right after it. */
export type SectionPlace = { before: string } | { after: string };

export function reorderSection(dir: string, slug: string, place: SectionPlace): void;
export function reorderSection(source: ResolvedDeck, slug: string, place: SectionPlace): void;
export function reorderSection(
  input: string | ResolvedDeck,
  slug: string,
  place: SectionPlace,
): void {
  const target = "before" in place ? place.before : place.after;
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
  const chunks = sectionChunks(
    lines,
    sections.map((section) => section.line),
  );

  const moved = chunks.splice(fromIndex, 1)[0];
  if (!moved) {
    return;
  }
  const remainingTarget = chunks.findIndex((_, index) => {
    const original = index < fromIndex ? index : index + 1;
    return original === targetIndex;
  });
  const insertAt = "before" in place ? remainingTarget : remainingTarget + 1;
  chunks.splice(insertAt, 0, moved);
  writeFileSync(deck.scriptPath, joinLines(source, [...head, ...chunks.flat()]));
}

function rewriteHeadingId(heading: string, from: string, to: string): string {
  const attr = new RegExp(`\\{#${escapeRegExp(from)}\\}`);
  if (attr.test(heading)) {
    return heading.replace(attr, `{#${to}}`);
  }
  return `${heading} {#${to}}`;
}
