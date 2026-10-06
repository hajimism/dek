import {
  type CssDeclaration,
  isKeyframesPrelude,
  type Stylesheet,
  selectorClasses,
  selectorLayouts,
  splitSelectorList,
} from "./css.ts";
import { escapeRegExp } from "./escape.ts";
import { RUNTIME_CLASSES } from "./theme-facts.ts";

export type SlideUsage = {
  /** Classes the slide's markup uses. */
  classes: Iterable<string>;
  /** The slide's `data-layout`. */
  layout?: string;
  /** The slide's own stylesheet, whose `var()` and animations reach into the theme too. */
  css?: Stylesheet;
};

type ExcerptEntry = {
  atPath: string[];
  selector: string;
  decls: CssDeclaration[];
  keyframes?: string;
};

/**
 * The part of a theme one slide depends on, as CSS that reads on its own: the
 * rules its classes and layout select, element and state rules under `.slide`,
 * the keyframes those rules animate with, and only the tokens they reach
 * through `var()`. It errs toward keeping a rule, since a rule left out misleads
 * a reader silently while an extra one only costs a line.
 */
export function themeExcerpt(sheet: Stylesheet, usage: SlideUsage): string {
  const entries = excerptEntries(sheet, usage);
  const own = usage.css?.decls ?? [];
  const styled = [
    ...entries.filter((entry) => !entry.keyframes).flatMap((entry) => entry.decls),
    ...own,
  ].filter((decl) => !decl.property.startsWith("--"));
  const keyframes = animatedKeyframes(styled, entries);
  const kept = entries.filter((entry) => !entry.keyframes || keyframes.has(entry.keyframes));
  const tokens = reachedTokens(
    [...styled, ...kept.filter((entry) => entry.keyframes).flatMap((entry) => entry.decls)],
    sheet.decls,
  );

  return renderExcerpt(
    kept
      .map((entry) => ({
        ...entry,
        decls: entry.decls.filter(
          (decl) => !decl.property.startsWith("--") || tokens.has(decl.property),
        ),
      }))
      .filter((entry) => entry.decls.length > 0),
  );
}

/**
 * Every keyframe stop, and every block of declarations with at least one selector part the slide
 * selects. A nested rule reads with its selector resolved, so the excerpt stands on its own.
 */
function excerptEntries(sheet: Stylesheet, usage: SlideUsage): ExcerptEntry[] {
  const used = new Set([...usage.classes, "slide", ...RUNTIME_CLASSES]);
  const entries: ExcerptEntry[] = [];
  for (const rule of sheet.rules) {
    // An at-rule's block reads here only where it styles its parent's elements.
    const parent = rule.kind === "at" ? rule.parent : undefined;
    if (rule.kind === "at" && (rule.descriptors || !parent)) {
      continue;
    }
    const selector = rule.kind === "style" ? rule.selector : (parent?.selector ?? "");
    const atPath = rule.kind === "at" ? [...rule.atPath, rule.prelude] : rule.atPath;
    const keyframes = rule.keyframe ? atPath.find(isKeyframesPrelude) : undefined;
    if (keyframes) {
      entries.push({ atPath, selector, decls: rule.decls, keyframes: keyframesName(keyframes) });
      continue;
    }
    const parts = splitSelectorList(selector)
      .map((part) => part.trim())
      .filter((part) => part && selectorPartApplies(part, used, usage.layout));
    if (parts.length > 0) {
      entries.push({ atPath, selector: parts.join(", "), decls: rule.decls });
    }
  }
  return entries;
}

/** The names of the keyframes the kept declarations animate with. */
function animatedKeyframes(styled: CssDeclaration[], entries: ExcerptEntry[]): Set<string> {
  const animations = styled
    .filter((decl) => /^animation(-name)?$/.test(decl.property))
    .map((decl) => decl.value);
  return new Set(
    entries.flatMap((entry) =>
      entry.keyframes && animations.some((value) => mentionsName(value, entry.keyframes ?? ""))
        ? [entry.keyframes]
        : [],
    ),
  );
}

function selectorPartApplies(part: string, used: Set<string>, layout?: string): boolean {
  if (part.startsWith("::view-transition")) {
    return false;
  }
  return (
    selectorClasses(part).every((name) => used.has(name)) &&
    selectorLayouts(part).every((name) => name === layout)
  );
}

function keyframesName(at: string): string {
  return at
    .replace(/^@(-\w+-)?keyframes\b/i, "")
    .trim()
    .replace(/^(["'])(.*)\1$/, "$2");
}

function mentionsName(value: string, name: string): boolean {
  return new RegExp(`(^|[\\s,])${escapeRegExp(name)}($|[\\s,])`).test(value);
}

function varNames(value: string): string[] {
  return [...value.matchAll(/var\(\s*(--[-\w]+)/g)].map((match) => match[1] ?? "");
}

/** The tokens `decls` use, following each token's own `var()` to the ones it is built from. */
function reachedTokens(decls: CssDeclaration[], all: CssDeclaration[]): Set<string> {
  const definitions = new Map<string, string[]>();
  for (const decl of all) {
    if (decl.property.startsWith("--")) {
      definitions.set(decl.property, [...(definitions.get(decl.property) ?? []), decl.value]);
    }
  }
  const reached = new Set<string>();
  const queue = decls.flatMap((decl) => varNames(decl.value));
  for (let name = queue.pop(); name !== undefined; name = queue.pop()) {
    if (reached.has(name)) {
      continue;
    }
    reached.add(name);
    for (const value of definitions.get(name) ?? []) {
      queue.push(...varNames(value));
    }
  }
  return reached;
}

function renderExcerpt(entries: ExcerptEntry[]): string {
  const lines: string[] = [];
  const open: string[] = [];
  const pad = (depth: number) => "  ".repeat(depth);
  for (const entry of entries) {
    let common = 0;
    while (
      common < open.length &&
      common < entry.atPath.length &&
      open[common] === entry.atPath[common]
    ) {
      common++;
    }
    while (open.length > common) {
      open.pop();
      lines.push(`${pad(open.length)}}`);
    }
    for (const at of entry.atPath.slice(open.length)) {
      lines.push(`${pad(open.length)}${at} {`);
      open.push(at);
    }
    const indent = pad(open.length);
    lines.push(
      `${indent}${entry.selector} {`,
      ...entry.decls.map((decl) => `${indent}  ${decl.property}: ${decl.value};`),
      `${indent}}`,
    );
  }
  while (open.length > 0) {
    open.pop();
    lines.push(`${pad(open.length)}}`);
  }
  return lines.length > 0 ? `${lines.join("\n")}\n` : "";
}
