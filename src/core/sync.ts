import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cssClassNames, cssCustomProperties, cssLayoutNames } from "./css.ts";
import { escapeHtml } from "./escape.ts";
import { asResolvedDeck, listSlides, type ResolvedDeck } from "./resolve.ts";
import { frontmatterJsonSchema, type Section } from "./schema.ts";

export type SyncResult = { created: string[] };

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
- Use only classes defined in this deck's \`theme.css\`.
- Color, type, space, radius, and motion in \`theme.css\` use token \`var()\` only.
- Do not add \`<style>\`, \`style=\`, or \`<script>\` to slides.
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
    .map((beat, index) => {
      const step = beat.id ?? String(index + 1);
      return `    <li data-step="${step}">${escapeHtml(beat.title)}</li>`;
    })
    .join("\n");
  return `<section class="slide" data-layout="default">
    <h2 class="slide-title">${escapeHtml(heading)}</h2>
    <ul>
${items}
    </ul>
  </section>`;
}
