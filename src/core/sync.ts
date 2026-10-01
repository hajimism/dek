import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "./config.ts";
import { type DeckPaths, deckPaths } from "./deck-paths.ts";
import { parseRefSource, refDir, refTitle } from "./ref.ts";
import { asResolvedDeck, listSlides, type ResolvedDeck, SLIDE_SIDECARS } from "./resolve.ts";
import { outputDir, readSourceIfExists, removeInside, writeInside } from "./safe-fs.ts";
import { frontmatterJsonSchema } from "./schema.ts";
import { deckLayouts, sectionSkeleton } from "./skeleton.ts";
import { type SkeletonRecord, skeletonRecord } from "./skeleton-record.ts";

/**
 * `updated` lists skeletons nobody edited, rewritten because the script moved on; `removed`, the
 * ones whose section is gone from the script. `kept` lists the slides whose section is gone too
 * but that sync left alone, being the author's. `dekFiles` is what became of dek's own files at
 * the project root.
 */
export type SyncResult = {
  created: string[];
  updated: string[];
  removed: string[];
  kept: string[];
  dekFiles: FileChanges;
};

/** Files a write made (`created`) or brought up to date (`updated`); a current one is in neither. */
export type FileChanges = { created: string[]; updated: string[] };

/** What a write did to one file; undefined when it was already current and left alone. */
type Written = "created" | "updated" | undefined;

function writeIfChanged(path: string, contents: string, root: string): Written {
  const current = readSourceIfExists(path, root);
  if (current === contents) {
    return undefined;
  }
  writeInside(path, contents, root);
  return current === undefined ? "created" : "updated";
}

/**
 * dek's own files at the project root, in the order they are written: the frontmatter schema and
 * the slide types an editor reads, and AGENTS.md, whose dek block agents read. They follow this
 * version of dek and the project's refs, not any one deck.
 */
export function dekFilePaths(root: string): string[] {
  return dekFileWriters(root).map(([path]) => path);
}

function dekFileWriters(root: string): Array<[path: string, write: () => Written]> {
  return [
    [join(root, ".dek", "schema.json"), () => writeFrontmatterSchema(root)],
    [join(root, ".dek", "slide.d.ts"), () => writeSlideTypes(root)],
    [join(root, "AGENTS.md"), () => writeAgentsMd(root)],
  ];
}

/**
 * Brings dek's own files up to date, writing only the ones that differ. They change when dek or
 * the project's refs do, so the first command to run after either, whichever it is, reports them.
 */
export function writeDekFiles(root: string): FileChanges {
  const changes: FileChanges = { created: [], updated: [] };
  for (const [path, write] of dekFileWriters(root)) {
    const written = write();
    if (written) {
      changes[written].push(path);
    }
  }
  return changes;
}

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
 * `tsconfig.json` is the project's; only `dekc init` writes one.
 */
function writeSlideTypes(root: string): Written {
  return writeIfChanged(
    join(root, ".dek", "slide.d.ts"),
    readFileSync(slideTypesPath, "utf8"),
    root,
  );
}

function writeFrontmatterSchema(root: string): Written {
  const schema = `${JSON.stringify(frontmatterJsonSchema(), null, 2)}\n`;
  return writeIfChanged(join(root, ".dek", "schema.json"), schema, root);
}

export function syncDeck(dir: string): SyncResult;
export function syncDeck(source: ResolvedDeck): SyncResult;
export function syncDeck(input: string | ResolvedDeck): SyncResult {
  const { project, deck } = asResolvedDeck(input);
  const paths = deckPaths(deck.dir);
  outputDir(paths.slides, project.root);
  const layouts = deckLayouts(deck.dir);
  const record = skeletonRecord(deck.dir);

  const existing = new Map(listSlides(deck.dir).map((slide) => [slide.slug, slide.path]));
  const created: string[] = [];
  const updated: string[] = [];
  const { removed, kept } = removeOrphanSkeletons(
    { root: project.root, paths, record },
    [...existing].filter(([slug]) => !deck.deck.sections.some((section) => section.slug === slug)),
  );

  for (const [index, section] of deck.deck.sections.entries()) {
    const skeleton = sectionSkeleton(deck.deck, index, layouts);
    const current = existing.get(section.slug);
    if (current) {
      const html = readFileSync(current, "utf8");
      if (!record.owns(html, skeleton)) {
        continue;
      }
      if (html !== skeleton) {
        writeInside(current, skeleton, project.root);
        updated.push(current);
      }
      record.keep(skeleton);
      continue;
    }
    const path = paths.slide(section.slug, ".html");
    if (existsSync(path)) {
      continue;
    }
    writeInside(path, skeleton, project.root);
    created.push(path);
    record.keep(skeleton);
  }
  record.save();

  return { created, updated, removed, kept, dekFiles: writeDekFiles(project.root) };
}

/**
 * A slide whose section is gone from the script is still dek's own output while it is a skeleton
 * nobody edited and nothing sits beside it: the script no longer asks for it, and it holds nothing
 * the script could not write again. Anything the author touched stays, and lint names it
 * (DEK002). A section renamed in the script gets a fresh skeleton under its new id, so nothing is
 * lost there either; the same holds for an id that flickers while a heading is being typed.
 */
function removeOrphanSkeletons(
  { root, paths, record }: { root: string; paths: DeckPaths; record: SkeletonRecord },
  orphans: [string, string][],
): { removed: string[]; kept: string[] } {
  const removed: string[] = [];
  const kept: string[] = [];
  for (const [slug, path] of orphans) {
    const html = readFileSync(path, "utf8");
    const beside = ([...SLIDE_SIDECARS, ".js"] as const).some((ext) =>
      existsSync(paths.slide(slug, ext)),
    );
    if (!record.owns(html, undefined) || beside) {
      kept.push(path);
      if (record.owns(html, undefined)) {
        record.keep(html);
      }
      continue;
    }
    removeInside(path, root);
    removed.push(path);
  }
  return { removed, kept };
}

/**
 * AGENTS.md is shared: dek owns only the block between these markers and rewrites it in place.
 * What the author writes around it is theirs.
 */
const AGENTS_BEGIN =
  "<!-- dek:begin (dek rewrites this block; write your own notes outside it) -->";
const AGENTS_END = "<!-- dek:end -->";

/**
 * Writes dek's block into AGENTS.md. An unchanged file is left alone, so a sync on every save does
 * not touch it.
 */
export function writeAgentsMd(root: string): Written {
  const path = join(root, "AGENTS.md");
  return writeIfChanged(
    path,
    withAgentsBlock(readSourceIfExists(path, root), agentsMd(root)),
    root,
  );
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

/**
 * What dek's block in AGENTS.md says. It names nothing a deck's theme decides: each deck owns its
 * theme.css, so a class list read from any one theme is wrong for the decks whose copy has grown,
 * and it would sit in every agent's context. `dekc theme` reads the deck's own.
 */
function agentsMd(root: string): string {
  return `# dek

A build system for talks. Write what you will say; dek builds, measures, and ships the rest.

## Principles

- \`script.md\` is the source of truth for order, script, and timing.
- Each slide is a \`<section class="slide">\` fragment.
- Conventions are enforced by lint. A deck is not done while \`dekc lint --visual\` fails. Passing it means nothing measurable is wrong, not that the deck is good.

## Conventions

- One \`##\` heading is one slide. HTML lives in \`slides/<id>.html\`.
- Each deck owns its \`theme.css\`. Before writing a slide, run \`dekc theme\` in the deck for the classes, tokens, and layouts it defines, and \`dekc theme <layout>\` for a layout's markup.
- Shared look lives in \`theme.css\`. Decoration only one slide uses lives in \`slides/<id>.css\`, which is scoped to that slide.
- Use only classes defined in \`theme.css\` or in that slide's own \`slides/<id>.css\`. The theme holds at most \`max_classes\` in \`dek.toml\`, 40 by default (\`DEK013\`); classes in \`slides/<id>.css\` do not count, so keep a class only one slide uses there.
- A rule in \`slides/<id>.css\` weighs as if it were written at the end of \`theme.css\`: it beats the theme's \`.slide .x\`, but not a more specific rule such as a layout's \`.slide[data-layout="split"] .x\` or the beat state \`.slide.is-current [data-step]\`. To override one of those, write the same selector.
- Color, type, space, radius, and motion in either stylesheet use token \`var()\` only. A value only one slide uses can be a token of its own on that slide's \`.slide\` rule in \`slides/<id>.css\`.
- Do not add \`<style>\`, \`style=\`, \`<script>\`, event handler attributes (\`onclick=\` and the like), or \`javascript:\` URLs inside slide HTML.
- Motion CSS cannot express lives in \`slides/<id>.ts\`: \`export default { motion: { <step>: ms }, draw(slide, { index, step, t }) {} } satisfies DekSlide\`. \`DekSlide\` is global, from \`.dek/slide.d.ts\`; do not import it. Key the slide's arrival, before its first beat, as \`"0"\`: every \`data-step\` element is hidden there, so draw what the slide shows before anything happens. Draw from \`t\` alone and set everything you touch on every call, with no timers and no imports, so video and screenshots can seek it. In \`draw\`, find elements by data-* attributes from the slide it is given, never by class or through \`document\`: the built deck holds every slide.
- Keep the deck self-contained: no remote URLs and no paths outside the deck.
- Every slide carries its place in \`script.md\` as \`--dek-slide-number\` and \`--dek-slide-count\`. Print a folio from them in \`theme.css\`, never by hand: \`.slide { counter-reset: folio var(--dek-slide-number) }\`, then \`content: counter(folio)\`. It follows the script as slides move.

## Checking a slide

- \`dekc check <slug> --shot\` lints one slide and screenshots it at its last beat.
- In \`dekc check <slug> --json\`, \`fill\` says how much of the frame the slide fills at its last beat, and where: \`coverage\`, the \`box\` it lies in, and \`rows\` and \`columns\`, the share of each tenth. It counts what the audience reads or looks at: text, pictures, and painted boxes that hold nothing, as a chart's bars. A card counts by what it holds, so one with its words at the top leaves its lower half empty; decoration under \`aria-hidden\` counts too. Read it before you open the shot to see whether a slide is sparse or leaves a band empty. Judge by \`rows\`, \`columns\`, and \`box\`, where an empty band is a run of zeros: \`coverage\` alone says little, since a chapter door in large type and a dense slide can share it. Whether a band left empty is right for the slide is yours to judge.
- A shot's path names what it drew, and an edit to the slide or the theme replaces the file. Never reuse a shot's path from before an edit: run \`dekc shot <slug>\` again, which shoots only what changed, and read the path it prints.
- \`dekc shot --sheet\` tiles every slide on one image: read it to judge the deck's balance in one look, then open a slide's own shot for detail.
- Mark decoration \`aria-hidden="true"\`: a glow that bleeds off the slide, or a sample of text the talk shows as unreadable. Lint measures neither overflow nor contrast on it, and screen readers skip it, so never mark text the audience should read: \`DEK029\` warns of text under it.
- When a hint sends a fix to \`theme.css\`, make it there, not in \`slides/<id>.css\`: the theme alone draws it that way, so other slides share the problem, and one change fixes them all.
- One shot shows no motion. \`dekc shot <slug> --motion\` lays the slide's beats out as rows, each held at moments through everything it moves and ending as the shot does. \`dekc shot <a> --to <b> --at 0.5\` freezes the view transition between any two slides.

## After a rehearsal

- \`dekc marks\` lists the beats the speaker marked while rehearsing aloud (\`m\` in the presenter view): the words they stumbled over are \`was\`, at \`line\` in \`script.md\`. Rewrite those beats to be easier to say, and keep each beat's heading so its mark follows it; \`status\` turns \`edited\` once the words changed.
- Leave \`dekc marks clear\` to the speaker: only saying the new words aloud tells whether they work.

## Before you report a deck as done

- \`dekc lint --visual\` passes.
- You have read \`dekc shot --sheet\` and judged the deck's balance.
- Say what you could not judge, such as the argument and the timing, and leave it to the author.
${referencesSection(root)}
For commands, run \`dekc help --agent\`.
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

Other people's decks, pinned in \`dek.toml\` \`[refs]\`, to read as models. They are read-only: read a slide with \`dekc show <ref> <slug>\`, then write your own in this deck's theme.

${lines.join("\n")}
`;
}
