import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "./config.ts";
import { parseCss } from "./css.ts";
import { type DeckPaths, deckPaths } from "./deck-paths.ts";
import { parseRefSource, refDir, refTitle } from "./ref.ts";
import { asResolvedDeck, listSlides, type ResolvedDeck, SLIDE_SIDECARS } from "./resolve.ts";
import { outputDir, readSourceIfExists, removeInside, writeInside } from "./safe-fs.ts";
import { frontmatterJsonSchema } from "./schema.ts";
import { isSkeleton, sectionSkeleton } from "./skeleton.ts";
import { type ThemeFacts, themeFacts } from "./theme-facts.ts";

/**
 * `updated` lists skeletons nobody edited, rewritten because the script moved on; `removed`, the
 * ones whose section is gone from the script.
 */
export type SyncResult = { created: string[]; updated: string[]; removed: string[] };

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
  const path = join(root, ".dek", "slide.d.ts");
  const types = readFileSync(slideTypesPath, "utf8");
  if (readSourceIfExists(path, root) !== types) {
    writeInside(path, types, root);
  }
  return path;
}

export function writeFrontmatterSchema(root: string): string {
  const path = join(root, ".dek", "schema.json");
  writeInside(path, `${JSON.stringify(frontmatterJsonSchema(), null, 2)}\n`, root);
  return path;
}

export function syncDeck(dir: string): SyncResult;
export function syncDeck(source: ResolvedDeck): SyncResult;
export function syncDeck(input: string | ResolvedDeck): SyncResult {
  const { project, deck } = asResolvedDeck(input);
  const paths = deckPaths(deck.dir);
  outputDir(paths.slides, project.root);

  const existing = new Map(listSlides(deck.dir).map((slide) => [slide.slug, slide.path]));
  const created: string[] = [];
  const updated: string[] = [];
  const removed = removeOrphanSkeletons(
    project.root,
    paths,
    [...existing].filter(([slug]) => !deck.deck.sections.some((section) => section.slug === slug)),
  );

  for (const [index, section] of deck.deck.sections.entries()) {
    const skeleton = sectionSkeleton(deck.deck, index);
    const current = existing.get(section.slug);
    if (current) {
      const html = readFileSync(current, "utf8");
      if (html !== skeleton && isSkeleton(html)) {
        writeInside(current, skeleton, project.root);
        updated.push(current);
      }
      continue;
    }
    const path = paths.slide(section.slug, ".html");
    if (existsSync(path)) {
      continue;
    }
    writeInside(path, skeleton, project.root);
    created.push(path);
  }

  writeFrontmatterSchema(project.root);
  writeSlideTypes(project.root);
  writeAgentsMd(project.root);
  return { created, updated, removed };
}

/**
 * A slide whose section is gone from the script is still dek's own output while it is a skeleton
 * nobody edited and nothing sits beside it: the script no longer asks for it, and it holds nothing
 * the script could not write again. Anything the author touched stays, and lint names it (DEK002).
 * A section renamed in the script gets a fresh skeleton under its new id, so nothing is lost there
 * either; the same holds for an id that flickers while a heading is being typed.
 */
function removeOrphanSkeletons(
  root: string,
  paths: DeckPaths,
  orphans: [string, string][],
): string[] {
  const removed: string[] = [];
  for (const [slug, path] of orphans) {
    const beside = ([...SLIDE_SIDECARS, ".js"] as const).some((ext) =>
      existsSync(paths.slide(slug, ext)),
    );
    if (!beside && isSkeleton(readFileSync(path, "utf8"))) {
      removeInside(path, root);
      removed.push(path);
    }
  }
  return removed;
}

/**
 * AGENTS.md is shared: dek owns only the block between these markers and rewrites it in place.
 * What the author writes around it is theirs.
 */
const AGENTS_BEGIN =
  "<!-- dek:begin (dek rewrites this block; write your own notes outside it) -->";
const AGENTS_END = "<!-- dek:end -->";

/**
 * Writes dek's block into AGENTS.md, from the project theme.css (or another, for a deck's own).
 * An unchanged file is left alone, so a sync on every save does not touch it.
 */
export function writeAgentsMd(root: string, themePath = join(root, "theme.css")): string {
  const path = join(root, "AGENTS.md");
  const current = readSourceIfExists(path, root);
  const theme = themeFacts(parseCss(readSourceIfExists(themePath, root) ?? ""));
  const next = withAgentsBlock(current, agentsMd(root, theme));
  if (next !== current) {
    writeInside(path, next, root);
  }
  return path;
}

/**
 * `current` with dek's block set to `body`. The block is replaced where it is, the first complete
 * begin-end pair counting from the begin nearest its end, so a stray marker never swallows the
 * author's lines. A file that is exactly `body` without markers, as dek wrote it before it used
 * them, is dek's to replace; any other file keeps every line and gets the block appended.
 */
function withAgentsBlock(current: string | undefined, body: string): string {
  const block = `${AGENTS_BEGIN}\n${body}${AGENTS_END}\n`;
  if (current === undefined || current.trim() === "" || current === body) {
    return block;
  }
  const lines = current.split(/(?<=\n)/);
  let begin: number | undefined;
  for (const [index, line] of lines.entries()) {
    if (line.startsWith("<!-- dek:begin")) {
      begin = index;
    } else if (begin !== undefined && line.trimEnd() === AGENTS_END) {
      return [...lines.slice(0, begin), block, ...lines.slice(index + 1)].join("");
    }
  }
  return `${current.endsWith("\n") ? current : `${current}\n`}\n${block}`;
}

/** What dek's block in AGENTS.md says for a project whose theme is `theme`. */
function agentsMd(root: string, theme: ThemeFacts): string {
  const classes = [...theme.classes].sort();
  const layouts = theme.layouts.map((layout) => layout.name);
  const tokens = theme.tokens.map((token) => token.name).sort();
  const classList = classes.map((name) => `- \`${name}\``).join("\n") || "- (none)";
  const layoutList = layouts.map((name) => `- \`${name}\``).join("\n") || "- (none)";
  const tokenList = tokens.map((name) => `- \`${name}\``).join("\n") || "- (none)";
  return `# dek

A build system for talks. Write what you will say; dek builds, measures, and ships the rest.

## Principles

- \`script.md\` is the source of truth for order, script, and timing.
- Each slide is a \`<section class="slide">\` fragment.
- Conventions are enforced by lint; a deck is done when lint passes.

## Conventions

- One \`##\` heading is one slide. HTML lives in \`slides/<id>.html\`.
- Shared look lives in \`theme.css\`. Decoration only one slide uses lives in \`slides/<id>.css\`, which is scoped to that slide.
- Use only classes defined in \`theme.css\` or in that slide's own \`slides/<id>.css\`.
- Color, type, space, radius, and motion in either stylesheet use token \`var()\` only. A value only one slide uses can be a token of its own on that slide's \`.slide\` rule in \`slides/<id>.css\`.
- Do not add \`<style>\`, \`style=\`, \`<script>\`, event handler attributes (\`onclick=\` and the like), or \`javascript:\` URLs inside slide HTML.
- Motion CSS cannot express lives in \`slides/<id>.ts\`: \`export default { motion: { <step>: ms }, draw(slide, { index, step, t }) {} } satisfies DekSlide\`. \`DekSlide\` is global, from \`.dek/slide.d.ts\`; do not import it. Key the slide's arrival, before its first beat, as \`"0"\`: every \`data-step\` element is hidden there, so draw what the slide shows before anything happens. Draw from \`t\` alone and set everything you touch on every call, with no timers and no imports, so video and screenshots can seek it. In \`draw\`, find elements by data-* attributes, not classes.
- Keep the deck self-contained: no remote URLs and no paths outside the deck.
- Every slide carries its place in \`script.md\` as \`--dek-slide-number\` and \`--dek-slide-count\`. Print a folio from them in \`theme.css\`, never by hand: \`.slide { counter-reset: folio var(--dek-slide-number) }\`, then \`content: counter(folio)\`. It follows the script as slides move.

## Checking a slide

- \`dek check <slug> --shot\` lints one slide and screenshots it at its last beat.
- \`dek shot --sheet\` tiles every slide on one image: read it to judge the deck's balance in one look, then open a slide's own shot for detail.
- One shot shows no motion. \`dek shot <slug> --motion\` lays the slide's beats out as rows, each held at moments through everything it moves and ending as the shot does. \`dek shot <a> --to <b> --at 0.5\` freezes the view transition between any two slides.

## Theme classes

From the project \`theme.css\`. A deck's own \`theme.css\` can differ; \`dek theme\` lists what a deck's theme defines.

${classList}

## Theme tokens

${tokenList}

## Layouts

${layoutList}

For a layout's markup, run \`dek theme <layout>\`.
${referencesSection(root)}
For commands, run \`dek help --agent\`.
`;
}

/**
 * The refs dek.toml pins, one line each, so an agent knows which decks it may
 * read as models. Empty when there are none, leaving AGENTS.md as before. A
 * dek.toml that does not parse leaves it empty too: sync runs on every save
 * in the dev server, and the commands that read dek.toml report the error.
 */
function referencesSection(root: string): string {
  let pinned: Record<string, string>;
  try {
    pinned = loadConfig(join(root, "dek.toml")).refs ?? {};
  } catch {
    return "";
  }
  const refs = Object.keys(pinned).sort();
  if (refs.length === 0) {
    return "";
  }
  const lines = refs.map((name) => {
    const title = refTitle(refDir(root, name), parseRefSource(name).deck)?.title;
    return title ? `- \`${name}\`: ${title}` : `- \`${name}\``;
  });
  return `
## References

Other people's decks, pinned in \`dek.toml\` \`[refs]\`, to read as models. They are read-only: read a slide with \`dek show <ref> <slug>\`, then write your own in this deck's theme.

${lines.join("\n")}
`;
}
