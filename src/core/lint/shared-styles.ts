import { isKeyframesPrelude, selectorClasses, splitSelectorList, startsAtSlide } from "../css.ts";
import { deckPaths } from "../deck-paths.ts";
import { type Diagnostic, diag } from "../diagnostic.ts";
import { scanSlideHtml } from "../html-scan.ts";
import type { LintContext } from "./context.ts";

/** How many slides may style something alike before it belongs in the theme: the third copy. */
const SHARED_BY = 3;

/** One declaration as one slide writes it. */
type Setting = {
  /** The selector part as this slide writes it, spaces squashed. */
  selector: string;
  declaration: string;
  atPath: string[];
  line: number;
};

/** One slide's share under one selector: the slides it shares any of it with, and its settings. */
type Finding = { slugs: Set<string>; settings: Setting[] };

const squash = (text: string): string => text.replace(/\s+/g, " ").trim();

/**
 * A selector part as the slide's scope reads it, the way `scopeToSlide` rewrites it: a leading
 * `.slide` compound is the slide itself, anything else sits under it. So `.card` and
 * `.slide .card` match the same elements and are one selector here, and `.slide > .card` is not.
 */
function scopedSelector(part: string): string {
  const item = squash(part);
  return startsAtSlide(item) ? item.slice(".slide".length) : ` ${item}`;
}

/**
 * The selector part as theme.css must write it: under `.slide`, as the theme scopes every rule
 * and as the slide's own scope already read it.
 */
function themeSelector(part: string): string {
  return `.slide${scopedSelector(part)}`;
}

/**
 * The other slides a rule moved into the theme would also reach: the ones whose markup uses
 * every class the selector names, and that do not set it themselves. A selector with no class,
 * such as `h2`, is left out: which slides it matches is for the author to look at.
 */
function alsoReaches(ctx: LintContext, selector: string, setters: string[]): string[] {
  const classes = selectorClasses(selector);
  if (classes.length === 0) {
    return [];
  }
  return [...ctx.sectionsBySlug.keys()].filter((slug) => {
    const source = setters.includes(slug) ? undefined : ctx.slideSource(slug);
    const used = source && new Set(scanSlideHtml(source.html).classes);
    return used !== undefined && classes.every((name) => used.has(name));
  });
}

/** "a", "a and b", "a, b, and c". */
function listed(items: string[]): string {
  if (items.length <= 2) {
    return items.join(" and ");
  }
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

/**
 * DEK026: the same declaration under the same selector in the stylesheets of SHARED_BY slides
 * or more. Each slide fixed alike on its own, as agents working on one slide each will, is one
 * fix the theme is missing. Each slide hears of it in its own check, once per selector: what it
 * shares there, and every slide it shares any of that with.
 */
export function sharedStyleDiagnostics(ctx: LintContext): Diagnostic[] {
  // Where a declaration applies and what it sets, to the slides that write it.
  const bySetting = new Map<string, { where: string; slides: Map<string, Setting> }>();
  for (const slug of ctx.sectionsBySlug.keys()) {
    const style = ctx.slideStyle(slug);
    if (!style) {
      continue;
    }
    for (const decl of style.sheet.decls) {
      // A slide's keyframes are renamed apart from every other slide's.
      if (!decl.selector || decl.atPath.some(isKeyframesPrelude)) {
        continue;
      }
      const declaration = `${decl.property}: ${squash(decl.value)}`;
      for (const part of splitSelectorList(decl.selector)) {
        const where = [...decl.atPath.map(squash), scopedSelector(part)].join("\0");
        const key = [where, decl.property.toLowerCase(), squash(decl.value)].join("\0");
        const entry = bySetting.get(key) ?? { where, slides: new Map<string, Setting>() };
        if (!entry.slides.has(slug)) {
          entry.slides.set(slug, {
            selector: squash(part),
            declaration,
            atPath: decl.atPath,
            line: decl.line,
          });
        }
        bySetting.set(key, entry);
      }
    }
  }

  // Per slide, what it shares under one selector makes one finding, whoever it shares it with.
  const order = [...ctx.sectionsBySlug.keys()];
  const findings = new Map<string, Map<string, Finding>>();
  for (const { where, slides } of bySetting.values()) {
    if (slides.size < SHARED_BY) {
      continue;
    }
    for (const [slug, setting] of slides) {
      const groups = findings.get(slug) ?? new Map<string, Finding>();
      const found = groups.get(where) ?? { slugs: new Set<string>(), settings: [] };
      for (const other of slides.keys()) {
        found.slugs.add(other);
      }
      found.settings.push(setting);
      groups.set(where, found);
      findings.set(slug, groups);
    }
  }

  const paths = deckPaths(ctx.deck.dir);
  const cssOf = (slug: string): string => `slides/${slug}.css`;
  return order.flatMap((slug) =>
    [...(findings.get(slug)?.values() ?? [])]
      // In the order this slide's own file writes them.
      .map(({ slugs, settings }) => {
        const own = [...settings].sort((a, b) => a.line - b.line);
        const all = order.filter((other) => slugs.has(other));
        return { slugs: all, settings: own, line: own[0]?.line ?? 0 };
      })
      .sort((a, b) => a.line - b.line)
      .map(({ slugs, settings, line }) => {
        const [first] = settings;
        const selector = first?.selector ?? "";
        const atPath = first?.atPath ?? [];
        const declarations = settings.map((setting) => setting.declaration);
        const block = `{ ${declarations.join("; ")} }`;
        const rule = `${[...atPath, selector].join(" ")} ${block}`;
        const themeRule = `${[...atPath, themeSelector(selector)].join(" ")} ${block}`;
        const others = slugs.filter((other) => other !== slug).map(cssOf);
        // Moving it changes these too: a theme default that slides override is a real finding,
        // and whether the rest should follow is the author's call, made with these in view.
        const reaches = alsoReaches(ctx, selector, slugs);
        const htmlOf = (other: string): string => `slides/${other}.html`;
        const affected =
          reaches.length === 0
            ? ""
            : `; it also reaches ${listed(reaches.map(htmlOf))}, which ${reaches.length === 1 ? "uses" : "use"} ${selectorClasses(
                selector,
              )
                .map((name) => `.${name}`)
                .join(
                  "",
                )} without it, so check ${reaches.length === 1 ? "that slide" : "those slides"} after the move`;
        return diag("DEK026", {
          message: `${rule} is also in ${listed(others)}`,
          path: paths.slide(slug, ".css"),
          line,
          slug,
          hint: `write ${themeRule} once in theme.css and delete it from ${listed(slugs.map(cssOf))}${affected}`,
          data: {
            selector,
            declarations,
            slides: slugs,
            ...(atPath.length > 0 ? { atRules: atPath } : {}),
            ...(reaches.length > 0 ? { alsoReaches: reaches } : {}),
          },
        });
      }),
  );
}
