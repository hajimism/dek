import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cssClassNames, cssCustomProperties, cssLayoutNames } from "./css.ts";
import { escapeHtml } from "./escape.ts";
import { asResolvedDeck, listSlides, type ResolvedDeck } from "./resolve.ts";
import { frontmatterJsonSchema, type Section } from "./schema.ts";
import { stepKey } from "./step.ts";

export type SyncResult = { created: string[] };

const slideTypesPath = join(import.meta.dir, "..", "runtime", "slide.d.ts");

/** Compiler settings that let an editor type-check slide scripts against `.dek/slide.d.ts`. */
export function defaultTsconfig(): string {
  return `${JSON.stringify(
    {
      compilerOptions: {
        lib: ["ESNext", "DOM", "DOM.Iterable"],
        // Slide scripts run in the browser; keep Node and Bun globals out of reach.
        types: [],
        target: "ESNext",
        module: "Preserve",
        moduleDetection: "force",
        strict: true,
        noEmit: true,
      },
      include: [".dek/*.d.ts", "decks/*/slides/*.ts"],
    },
    null,
    2,
  )}\n`;
}

/**
 * Keeps `.dek/slide.d.ts` in step with this dek. An unchanged file is left
 * alone so the editor's TypeScript server does not reload on every sync.
 * `tsconfig.json` is the project's; only `dek init` writes one.
 */
export function writeSlideTypes(root: string): string {
  const dir = join(root, ".dek");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "slide.d.ts");
  const types = readFileSync(slideTypesPath, "utf8");
  if (!existsSync(path) || readFileSync(path, "utf8") !== types) {
    writeFileSync(path, types);
  }
  return path;
}

export function writeFrontmatterSchema(root: string): string {
  const dir = join(root, ".dek");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "schema.json");
  writeFileSync(path, `${JSON.stringify(frontmatterJsonSchema(), null, 2)}\n`);
  return path;
}

export function syncDeck(dir: string): SyncResult;
export function syncDeck(source: ResolvedDeck): SyncResult;
export function syncDeck(input: string | ResolvedDeck): SyncResult {
  const { project, deck } = asResolvedDeck(input);
  const slidesDir = join(deck.dir, "slides");
  mkdirSync(slidesDir, { recursive: true });

  const existing = new Set(listSlides(deck.dir).map((slide) => slide.slug));
  const created: string[] = [];

  for (const [index, section] of deck.deck.sections.entries()) {
    if (existing.has(section.slug)) {
      continue;
    }
    const path = join(slidesDir, `${section.slug}.html`);
    if (existsSync(path)) {
      continue;
    }
    writeFileSync(path, renderSkeleton(section, skeletonHeading(section, index, deck.deck.title)));
    created.push(path);
  }

  writeFrontmatterSchema(project.root);
  writeSlideTypes(project.root);
  writeAgentsMd(project.root, join(project.root, "theme.css"));
  return { created };
}

function writeAgentsMd(root: string, themePath: string): void {
  const path = join(root, "AGENTS.md");
  const theme = existsSync(themePath) ? readFileSync(themePath, "utf8") : "";
  const classes = [...cssClassNames(theme)].sort();
  const layouts = [...cssLayoutNames(theme)].sort();
  const tokens = [...cssCustomProperties(theme)].sort();
  const classList = classes.map((name) => `- \`${name}\``).join("\n") || "- (none)";
  const layoutList = layouts.map((name) => `- \`${name}\``).join("\n") || "- (none)";
  const tokenList = tokens.map((name) => `- \`${name}\``).join("\n") || "- (none)";
  writeFileSync(
    path,
    `# dek

Talk-script-first HTML slides.

## Principles

- \`script.md\` is the source of truth for order, script, and timing.
- Each slide is a \`<section class="slide">\` fragment.
- Conventions are enforced by lint; a deck is done when lint passes.

## Conventions

- One \`##\` heading is one slide. HTML lives in \`slides/<id>.html\`.
- Shared look lives in \`theme.css\`. Decoration only one slide uses lives in \`slides/<id>.css\`, which is scoped to that slide.
- Use only classes defined in \`theme.css\` or in that slide's own \`slides/<id>.css\`.
- Color, type, space, radius, and motion in either stylesheet use token \`var()\` only.
- Do not add \`<style>\`, \`style=\`, or \`<script>\` inside slide HTML.
- Motion CSS cannot express lives in \`slides/<id>.ts\`: \`export default { motion: { <step>: ms }, draw(slide, { index, step, t }) {} } satisfies DekSlide\`. \`DekSlide\` is global, from \`.dek/slide.d.ts\`; do not import it. Draw from \`t\` alone and set everything you touch on every call, with no timers and no imports, so video and screenshots can seek it.
- Keep the deck self-contained: no remote URLs and no paths outside the deck.

## Theme classes

${classList}

## Theme tokens

${tokenList}

## Layouts

${layoutList}

For commands, run \`dek help --agent\`.
`,
  );
}

/**
 * A heading that is only an id (`## intro`) has no display text. The first
 * section takes the deck title; later ones stay empty so the slug never ends
 * up on a published slide.
 */
export function skeletonHeading(
  section: Pick<Section, "slug" | "title">,
  index: number,
  deckTitle: string,
): string {
  if (section.title !== section.slug) {
    return section.title;
  }
  return index === 0 ? deckTitle : "";
}

function renderSkeleton(section: Section, heading: string): string {
  const inner =
    section.beats.length === 0 ? renderTitleSlide(heading) : renderBeatSlide(section, heading);
  return `${inner}\n`;
}

function renderTitleSlide(heading: string): string {
  return `<section class="slide" data-layout="title">
    <h2 class="slide-title">${escapeHtml(heading)}</h2>
  </section>`;
}

function renderBeatSlide(section: Section, heading: string): string {
  const items = section.beats
    .map(
      (beat, index) =>
        `    <li data-step="${stepKey(section.beats, index)}">${escapeHtml(beat.title)}</li>`,
    )
    .join("\n");
  return `<section class="slide" data-layout="default">
    <h2 class="slide-title">${escapeHtml(heading)}</h2>
    <ul>
${items}
    </ul>
  </section>`;
}
