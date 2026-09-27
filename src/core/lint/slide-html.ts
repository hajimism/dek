import { type Diagnostic, diag } from "../diagnostic.ts";
import { type HtmlAttribute, type HtmlScan, type SourceSpot, scanSlideHtml } from "../html-scan.ts";
import type { Section } from "../schema.ts";
import { beatAt, formatStepChoices, resolveStep, stepChoices } from "../step.ts";
import { suggest } from "../suggest.ts";
import { isUrlAttribute } from "../url-attributes.ts";
import { assetRefDiagnostics } from "./asset-refs.ts";

/**
 * view-transition-names a data-morph may not take. The player names the slide box "slide",
 * the browser names the page "root", and the rest are keywords of the property itself.
 */
const RESERVED_MORPHS = new Set(["slide", "root", "none", "auto", "match-element"]);

/** One slide's markup, scanned once; every finding in it is located by the scan. */
type SlideHtml = {
  section: Section;
  path: string;
  scan: HtmlScan;
  /** Whether the file is still the skeleton `dek sync` wrote, which sync keeps in step. */
  skeleton: boolean;
};

export function lintSlideHtml(
  section: Section,
  path: string,
  html: string,
  options: {
    deckDir: string;
    skeleton?: boolean;
    classes?: Set<string>;
    layouts?: Set<string>;
    hasScript?: boolean;
  },
): Diagnostic[] {
  const slide: SlideHtml = {
    section,
    path,
    scan: scanSlideHtml(html),
    skeleton: options.skeleton === true,
  };
  if (slide.scan.slides.length === 0) {
    return [missingSectionDiagnostic(slide)];
  }
  return [
    ...extraSectionDiagnostics(slide),
    ...(options.layouts ? layoutDiagnostics(slide, options.layouts) : []),
    ...slugDiagnostics(slide),
    ...stepDiagnostics(slide),
    ...morphDiagnostics(slide),
    ...inlineCodeDiagnostics(slide),
    ...emptyHeadingDiagnostics(slide),
    ...(options.classes
      ? unknownClassDiagnostics(slide, options.classes, options.hasScript === true)
      : []),
    ...slide.scan.refs.flatMap((ref) =>
      assetRefDiagnostics(ref, {
        path,
        ...spotOf(ref),
        slug: section.slug,
        deckDir: options.deckDir,
      }),
    ),
  ];
}

/** Every `name` attribute in the markup, in document order. */
function attributesNamed(scan: HtmlScan, name: string): HtmlAttribute[] {
  return scan.elements.flatMap((element) =>
    element.attributes.filter((attribute) => attribute.name === name),
  );
}

/** The location fields of a diagnostic, from wherever the scan found the thing. */
function spotOf({ line, column }: SourceSpot): { line: number; column: number } {
  return { line, column };
}

/** DEK007: the file is there, but nothing in it is a slide, so build and show draw nothing for it. */
function missingSectionDiagnostic({ section, path }: SlideHtml): Diagnostic {
  return diag("DEK007", {
    message: `slides/${section.slug}.html has no <section class="slide">`,
    path,
    slug: section.slug,
    hint: 'wrap the slide markup in <section class="slide">…</section>',
  });
}

/** DEK009: more than one slide in a file; the player shows the first and drops the rest. */
function extraSectionDiagnostics({ section, path, scan }: SlideHtml): Diagnostic[] {
  const [, second] = scan.slides;
  if (!second) {
    return [];
  }
  return [
    diag("DEK009", {
      message: `slides/${section.slug}.html has ${scan.slides.length} <section class="slide">; only the first is shown`,
      path,
      ...spotOf(second),
      slug: section.slug,
      hint: "one file is one slide: add a ## section to script.md and move the rest into its file",
      data: { sections: scan.slides.length },
    }),
  ];
}

/** DEK019: a data-layout that neither the theme nor the slide's stylesheet lays out. */
function layoutDiagnostics({ section, path, scan }: SlideHtml, layouts: Set<string>): Diagnostic[] {
  const attribute = scan.slides[0]?.attributes.find((entry) => entry.name === "data-layout");
  if (scan.layout === undefined || !attribute || layouts.has(scan.layout)) {
    return [];
  }
  const known = [...layouts].sort();
  const guess = suggest(scan.layout, known);
  return [
    diag("DEK019", {
      message: `data-layout "${scan.layout}" is not a layout of the theme`,
      path,
      ...spotOf(attribute),
      slug: section.slug,
      hint: `${guess ? `did you mean ${guess}? ` : ""}run \`dek theme\` to see the layouts`,
      data: { layout: scan.layout, layouts: known },
    }),
  ];
}

/** DEK006: the slide's data-slug names another section. */
function slugDiagnostics({ section, path, scan }: SlideHtml): Diagnostic[] {
  const found = scan.slides
    .flatMap((element) => element.attributes)
    .find((attribute) => attribute.name === "data-slug");
  if (!found || found.value === section.slug) {
    return [];
  }
  return [
    diag("DEK006", {
      message: `data-slug "${found.value}" does not match section "${section.slug}"`,
      path,
      ...spotOf(found),
      slug: section.slug,
      data: { slug: found.value, expected: section.slug },
    }),
  ];
}

/**
 * DEK003: a data-step that is neither a beat id nor a beat index. DEK025: a beat index where
 * that beat has an id, which silently binds the next beat over once one is inserted before it.
 */
function stepDiagnostics({ section, path, scan }: SlideHtml): Diagnostic[] {
  return attributesNamed(scan, "data-step").flatMap((attribute) => {
    const step = attribute.value;
    const beatIndex = resolveStep(section.beats, step);
    if (beatIndex === undefined) {
      return [
        diag("DEK003", {
          message: `data-step "${step}" is not a beat id or index in "${section.slug}"`,
          path,
          ...spotOf(attribute),
          slug: section.slug,
          hint: stepHint(section),
          data: { step, choices: stepChoices(section.beats) },
        }),
      ];
    }
    const id = beatAt(section.beats, beatIndex)?.id;
    if (id === undefined || id === step) {
      return [];
    }
    return [
      diag("DEK025", {
        message: `data-step "${step}" is beat "${id}" by position; it moves if a beat is inserted before it`,
        path,
        ...spotOf(attribute),
        slug: section.slug,
        hint: `use data-step="${id}"`,
        data: { step, id },
      }),
    ];
  });
}

/** DEK005: a data-morph used twice, or one the player or CSS already means something by. */
function morphDiagnostics({ section, path, scan }: SlideHtml): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const first = new Map<string, HtmlAttribute>();
  const reported = new Set<string>();
  for (const attribute of attributesNamed(scan, "data-morph")) {
    const morph = attribute.value;
    if (!first.has(morph)) {
      first.set(morph, attribute);
      continue;
    }
    if (reported.has(morph)) {
      continue;
    }
    reported.add(morph);
    diagnostics.push(
      diag("DEK005", {
        message: `duplicate data-morph "${morph}"`,
        path,
        ...spotOf(attribute),
        slug: section.slug,
        data: { morph },
      }),
    );
  }
  for (const [morph, attribute] of first) {
    if (!RESERVED_MORPHS.has(morph)) {
      continue;
    }
    diagnostics.push(
      diag("DEK005", {
        message: `data-morph "${morph}" is reserved`,
        path,
        ...spotOf(attribute),
        slug: section.slug,
        hint: `rename it; the player uses "slide" and "root" for the page itself, and "none", "auto", and "match-element" are CSS keywords`,
        data: { morph },
      }),
    );
  }
  return diagnostics;
}

/**
 * DEK011: style or script inside the markup, which belongs in the slide's own .css or .ts. Every
 * occurrence is its own finding: a `<style>` or `<script>` element, a `style` attribute, an event
 * handler attribute, and a `javascript:` URL.
 */
function inlineCodeDiagnostics({ section, path, scan }: SlideHtml): Diagnostic[] {
  return scan.elements
    .flatMap((element) => [
      {
        spot: element as SourceSpot,
        found: inlineElement(element.tag, section.slug),
        data: { kind: "element", name: element.tag },
      },
      ...element.attributes.map((attribute) => ({
        spot: attribute as SourceSpot,
        found: inlineAttribute(element.tag, attribute, section.slug),
        data: { kind: "attribute", name: attribute.name, value: attribute.value },
      })),
    ])
    .flatMap(({ spot, found, data }) =>
      found
        ? [
            diag("DEK011", {
              message: found.message,
              path,
              ...spotOf(spot),
              slug: section.slug,
              hint: found.hint,
              data,
            }),
          ]
        : [],
    );
}

type InlineCode = { message: string; hint: string };

function inlineElement(tag: string, slug: string): InlineCode | undefined {
  if (tag === "style") {
    return {
      message: "slide contains a <style> element",
      hint: `move the rules to slides/${slug}.css`,
    };
  }
  if (tag === "script") {
    return { message: "slide contains a <script> element", hint: motionHint(slug) };
  }
  return undefined;
}

function inlineAttribute(
  tag: string,
  attribute: HtmlAttribute,
  slug: string,
): InlineCode | undefined {
  if (attribute.name === "style") {
    return {
      message: "slide contains a style attribute",
      hint: `move it to a class in slides/${slug}.css, using token var()`,
    };
  }
  if (EVENT_HANDLER_RE.test(attribute.name)) {
    return {
      message: `slide contains an ${attribute.name} attribute`,
      hint: `remove it; a slide takes no input, and motion goes in slides/${slug}.ts as a draw(t) function`,
    };
  }
  if (isUrlAttribute(tag, attribute.name) && isJavascriptUrl(attribute.value)) {
    return { message: "slide contains a javascript: URL", hint: motionHint(slug) };
  }
  return undefined;
}

function motionHint(slug: string): string {
  return `move motion to slides/${slug}.ts as a draw(t) function`;
}

/** `onclick`, `onload`, and every other attribute the browser runs as script. */
const EVENT_HANDLER_RE = /^on[a-z]+$/;
/** Read the way the URL parser reads it: tabs and newlines dropped, leading space trimmed, any case. */
function isJavascriptUrl(value: string): boolean {
  return value
    .replace(/[\t\n\r]/g, "")
    .trimStart()
    .toLowerCase()
    .startsWith("javascript:");
}

/**
 * DEK024: a heading with nothing in it, which the audience sees as a gap where a title should
 * be. An id-only `##` heading after the first slide makes one: sync never puts the id on a slide.
 */
function emptyHeadingDiagnostics({ section, path, scan, skeleton }: SlideHtml): Diagnostic[] {
  const hint = skeleton
    ? `give the slide a title in script.md, like \`## Your title {#${section.slug}}\`, then run \`dek sync\``
    : `write the heading's text in slides/${section.slug}.html, or remove the element`;
  return scan.emptyHeadings.map((element) =>
    diag("DEK024", {
      message: `<${element.tag}> is empty, so the slide shows no heading`,
      path,
      ...spotOf(element),
      slug: section.slug,
      hint,
      data: { tag: element.tag },
    }),
  );
}

/** DEK010: a class neither theme.css nor the slide's own stylesheet defines. */
function unknownClassDiagnostics(
  { section, path, scan }: SlideHtml,
  classes: Set<string>,
  hasScript: boolean,
): Diagnostic[] {
  const known = [...classes].sort();
  const shown =
    known.length > MAX_HINT_CLASSES ? [...known.slice(0, MAX_HINT_CLASSES), "…"] : known;
  const scriptHint = hasScript
    ? `; to find an element from slides/${section.slug}.ts, use a data-* attribute instead`
    : "";
  const hint = `define it in slides/${section.slug}.css, or use one of: ${shown.join(", ")}${scriptHint}`;
  const unknown = new Map<string, HtmlAttribute>();
  for (const attribute of attributesNamed(scan, "class")) {
    for (const name of attribute.value.split(/\s+/).filter(Boolean)) {
      if (!classes.has(name) && !unknown.has(name)) {
        unknown.set(name, attribute);
      }
    }
  }
  return [...unknown].map(([name, attribute]) => {
    const suggestion = suggest(name, known);
    return diag("DEK010", {
      message: `class "${name}" is not defined in theme.css`,
      path,
      ...spotOf(attribute),
      slug: section.slug,
      hint: suggestion ? `did you mean ${suggestion}? ${hint}` : hint,
      data: { class: name, ...(suggestion ? { suggestion } : {}) },
    });
  });
}

const MAX_HINT_CLASSES = 20;

function stepHint(section: Section): string {
  if (section.beats.length === 0) {
    return `add a ### beat under "## ${section.title}" in script.md, or drop data-step`;
  }
  return formatStepChoices(stepChoices(section.beats));
}
