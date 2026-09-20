import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DekError } from "./error.ts";
import { joinLines, splitLines } from "./lines.ts";
import { asResolvedDeck, type ResolvedDeck, requireSection } from "./resolve.ts";
import { Id } from "./schema.ts";

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
  if (existsSync(toPath)) {
    throw new DekError(`slide "${to}" already exists`, {
      path: toPath,
      hint: "run `dek ls`",
    });
  }

  let renamed = false;
  if (existsSync(fromPath)) {
    renameSync(fromPath, toPath);
    renamed = true;
  }
  try {
    writeFileSync(deck.scriptPath, joinLines(source, lines));
  } catch (error) {
    if (renamed && existsSync(toPath) && !existsSync(fromPath)) {
      renameSync(toPath, fromPath);
    }
    throw error;
  }
  if (renamed) {
    rewriteDataSlug(toPath, from, to);
  }
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

function rewriteDataSlug(path: string, from: string, to: string): void {
  const html = readFileSync(path, "utf8");
  const next = html.replaceAll(`data-slug="${from}"`, `data-slug="${to}"`);
  if (next !== html) {
    writeFileSync(path, next);
  }
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
