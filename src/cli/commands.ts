import { hasErrors } from "../core/diagnostic.ts";
import { mergeSarif, toSarif } from "../core/sarif.ts";
import type { CheckCliResult } from "./check.ts";
import type { ResultFields } from "./contract.ts";
import type { FlagName, FlagValues } from "./flags.ts";
import { type FormattedError, formatCreated, formatDiagnostics } from "./format.ts";
import type { NavResult } from "./goto.ts";
import type { DeckScope, DecksTarget, ReadableDeck } from "./scope.ts";
import {
  countSummary,
  displayDiagnostics,
  formatBuild,
  formatCheck,
  formatCues,
  formatInit,
  formatKept,
  formatKeptTheme,
  formatLs,
  formatMarks,
  formatMv,
  formatNav,
  formatNew,
  formatPdf,
  formatRef,
  formatShot,
  formatShow,
  formatSkipped,
  formatTheme,
  formatVideo,
  formatVoice,
} from "./text.ts";

type ArgKey<S extends string> = S extends `${infer N}?` ? N : S extends `${infer N}...` ? N : S;

/**
 * The words a command takes, by name: `name` is required, `name?` optional, and `name...`
 * takes every word left, joined by spaces.
 */
type Args<A extends readonly string[]> = {
  [S in A[number] as ArgKey<S>]: S extends `${string}?` ? string | undefined : string;
};

type TargetOf<S> = S extends "deck" ? ReadableDeck : S extends "decks" ? DecksTarget : undefined;

/** What a command is handed: its arguments by name, its flags typed, and its decks resolved. */
type Ctx<A extends readonly string[], S extends DeckScope | undefined> = {
  cwd: string;
  flags: FlagValues;
  args: Args<A>;
  /** What `scope` names, resolved: nothing for a command with no scope. */
  target: TargetOf<S>;
};

/** A context as the registry keeps it: the arguments as bound, checked by each declaration. */
type AnyCtx = Omit<Ctx<[], DeckScope | undefined>, "args"> & {
  args: Record<string, string | undefined>;
};

/** How a command's result is printed. Only `text` is required. */
export type Output<D> = {
  text(data: D, color: boolean): string;
  /** What did not happen, for stderr next to the text: the result on stdout stays the result. */
  notes?(data: D, color: boolean): string | undefined;
  /** The `--json` fields next to `ok`; the data as-is when absent. */
  json?(data: D): object;
  /** The data with every path into the source tree as `display` shows it. */
  paths?(data: D, display: (path: string) => string): D;
  /** The error of a run that did its job and found one. */
  failure?(data: D): FormattedError | undefined;
  /** `--format sarif`. */
  sarif?(data: D): object;
};

export type Group = "Development" | "Project" | "Refs" | "Slide" | "Output" | "Help";

/** One way to call a command: the words after it and its deck, its flags, and its usage. */
export type Form = {
  args: readonly string[];
  /** What it takes on top of the global flags, and --deck when it has a scope. */
  flags: readonly FlagName[];
  /** `dek help <command>`: each way to call it. */
  usage: string[];
};

type Runs<D> = { run(ctx: AnyCtx): Promise<D> };

/** A command's second word, such as `pin` in `dek voice pin`, with its own words and flags. */
export type SubSpec<D> = Form & Runs<D>;

type Base = Form & {
  summary: string;
  group: Group;
  /** Its lines in `dek help`: a call, then what it does. */
  overview: Array<readonly [string, string]>;
  /** Its lines in `dek help --agent`. */
  agent: string[];
  /** The decks it works on, which the CLI resolves; it then takes a deck name and --deck. */
  scope?: DeckScope;
  /** A ref may be its deck: the CLI fetches a pinned ref's missing snapshot first. */
  refs?: true;
  /**
   * A deck whose script.md cannot be read is handed over in `failed` rather than refused, for a
   * command whose answer is why: lint.
   */
  unreadable?: true;
  /** No word to type: `serve` is the bare `dek [deck]`. */
  bare?: true;
};

/** A command that prints a result, as text or `--json`. */
export type ResultSpec<D> = Base &
  Runs<D> & {
    kind: "result";
    output: Output<D>;
    subcommands?: Record<string, SubSpec<D>>;
  };

/** A command that keeps running until stopped, and so prints no result. */
export type SessionSpec = Base & Runs<void> & { kind: "session" };

/** `dek help`, answered before any command runs. */
export type HelpSpec = Base & { kind: "help" };

type Typed<A extends readonly string[], S extends DeckScope | undefined, D> = Omit<Form, "args"> & {
  args: A;
  run(ctx: Ctx<A, S>): Promise<D>;
};

type Declared<A extends readonly string[], S extends DeckScope | undefined, D> = Omit<
  Base,
  "args" | "scope"
> &
  Typed<A, S, D> & { scope?: S };

// The declarations check each run against its own args and scope; the registry keeps them erased.
// `J` is what `json` returns, kept so that what a command prints can be held to its contract below.
function result<
  D,
  const A extends readonly string[],
  S extends DeckScope | undefined = undefined,
  const U extends Record<string, readonly string[]> = Record<never, never>,
  J extends object = never,
>(
  spec: Declared<A, S, D> & {
    output: Output<D> & { json?(data: D): J };
    subcommands?: { [K in keyof U]: Typed<U[K], S, D> };
  },
): ResultSpec<D> & Printed<[J] extends [never] ? D : J> {
  return { kind: "result", ...spec } as unknown as ResultSpec<D> &
    Printed<[J] extends [never] ? D : J>;
}

/** What a result command prints beside `ok`, as a type alone: nothing carries it at run time. */
type Printed<P> = { readonly printed?: P };

function session<const A extends readonly string[], S extends DeckScope | undefined = undefined>(
  spec: Declared<A, S, void>,
): SessionSpec {
  return { kind: "session", ...spec } as unknown as SessionSpec;
}

/** Lint and check fail on an error diagnostic; everything else reports and succeeds. */
function diagnosticFailure(
  command: string,
  data: { diagnostics: CheckCliResult["diagnostics"] },
  rerun: string,
): FormattedError | undefined {
  if (!hasErrors(data.diagnostics)) {
    return undefined;
  }
  return {
    message: `${command} found ${countSummary(data.diagnostics)}`,
    hint: `fix each error in diagnostics, then run \`${rerun}\` again`,
  };
}

/** A position no page shows is where the next one lands; saying nothing would read as on screen. */
function navNotes(data: NavResult): string | undefined {
  return data.viewers > 0
    ? undefined
    : `no browser shows the deck: the next page opened on the dev server shows ${data.slug}`;
}

function withDisplayDiagnostics<D extends { diagnostics: CheckCliResult["diagnostics"] }>(
  data: D,
  display: (path: string) => string,
): D {
  return { ...data, diagnostics: displayDiagnostics(data.diagnostics, display) };
}

/**
 * Every command, in the order `dek help` lists them: the words and flags it takes, its help,
 * what it works on, how it runs, and how its result prints. Each module loads only when its
 * command runs.
 */
export const COMMANDS = {
  serve: session({
    bare: true,
    args: ["deck?"],
    flags: ["deck", "remote", "visual", "port"],
    usage: ["dek [deck] [--visual] [--port N] [--remote]"],
    summary:
      "Start the dev server: skeleton slides, live reload, lint on save, and the presenter view.\nIt keeps running until Ctrl-C.",
    group: "Development",
    overview: [
      [
        "dek [deck] [--visual] [--port N]",
        "start the dev server; --visual lints overflow/contrast on save",
      ],
      ["dek --remote", "share on LAN; presenter notes are password-protected"],
    ],
    agent: ["dek [deck] [--visual] [--port N]", "dek --remote"],
    run: async ({ cwd, args, flags }) => {
      const { serveCommand } = await import("./serve.ts");
      await serveCommand({
        cwd,
        deck: args.deck ?? flags.deck,
        remote: flags.remote,
        visual: flags.visual,
        port: flags.port,
      });
    },
  }),
  rehearse: session({
    scope: "deck",
    args: ["slug?"],
    flags: ["remote"],
    usage: ["dek rehearse [deck] [slug] [--remote]"],
    summary: "Play the deck to its Timeline, advancing on its own. Keeps running until Ctrl-C.",
    group: "Development",
    overview: [
      ["dek rehearse [slug]", "auto-advance from a Timeline (no video); --remote shares it"],
    ],
    agent: ["dek rehearse [slug] [--remote]"],
    run: async ({ target, args, flags }) => {
      const { rehearseCommand } = await import("./rehearse.ts");
      await rehearseCommand(target, { slug: args.slug, remote: flags.remote });
    },
  }),
  init: result({
    args: ["dir?"],
    flags: ["deck"],
    usage: ["dek init [dir] [--deck NAME]"],
    summary:
      "Create a project in dir (default: here), optionally with a first deck.\nNothing that exists is overwritten. Inside a project, add a deck with dek new.",
    group: "Project",
    overview: [["dek init [dir] [--deck NAME]", "create a project, optionally with a first deck"]],
    agent: ["dek init [dir] [--deck NAME]"],
    run: async ({ cwd, args, flags }) => {
      const { initCommand } = await import("./init.ts");
      return initCommand({ cwd, dir: args.dir, deck: flags.deck });
    },
    output: {
      text: formatInit,
      notes: (data, color) => formatKeptTheme(data, color) || undefined,
      paths: (data, display) => ({
        ...data,
        created: data.created.map(display),
        updated: data.updated.map(display),
        kept: data.kept.map(display),
      }),
    },
  }),
  new: result({
    args: ["name"],
    flags: ["theme-from"],
    usage: ["dek new <name> [--theme-from DECK]"],
    summary: "Add a deck with the project's theme, or another deck's, and its skeleton slides.",
    group: "Project",
    overview: [["dek new <name> [--theme-from DECK]", "add a deck"]],
    agent: ["dek new <name> [--theme-from DECK]"],
    run: async ({ cwd, args, flags }) => {
      const { newCommand } = await import("./new.ts");
      return newCommand({ cwd, name: args.name, themeFrom: flags["theme-from"] });
    },
    output: {
      text: formatNew,
      paths: (data, display) => ({
        ...data,
        created: data.created.map(display),
        updated: data.updated.map(display),
      }),
    },
  }),
  ls: result({
    scope: "decks",
    refs: true,
    args: [],
    flags: [],
    usage: ["dek ls [deck]"],
    summary: "List the decks, or summarize one: sections, slides, diagnostics, and timing.",
    group: "Project",
    overview: [["dek ls [deck]", "list decks or show one"]],
    agent: ["dek ls [deck]"],
    run: async ({ target }) => {
      const { lsCommand } = await import("./ls.ts");
      return lsCommand(target);
    },
    output: {
      text: formatLs,
      json: ({ kind: _kind, ...data }) => data,
      paths: (data, display) =>
        data.kind === "deck"
          ? withDisplayDiagnostics(data, display)
          : {
              ...withDisplayDiagnostics(data, display),
              decks: data.decks.map((deck) => withDisplayDiagnostics(deck, display)),
            },
    },
  }),
  ref: result({
    args: ["source?"],
    flags: [],
    usage: ["dek ref <owner/repo/deck>[@rev]", "dek ref"],
    summary:
      "Pin another project's deck to read as a model, list the pins, or drop one.\nls, show, theme, and shot read a ref as they read a deck.",
    group: "Refs",
    overview: [
      [
        "dek ref owner/repo/deck[@rev]",
        "pin and fetch one (a GitHub link works too); again moves the pin",
      ],
      ["dek ref", "list pinned refs"],
      ["dek ref rm <ref>", "drop one"],
    ],
    agent: [
      "dek ref [owner/repo/deck[@rev] | github-link]   pin + fetch; no args lists; dek ref rm <ref>",
    ],
    run: async ({ cwd, args }) => {
      const { addRef, listRefs } = await import("./ref.ts");
      return args.source === undefined ? listRefs(cwd) : addRef(cwd, args.source);
    },
    subcommands: {
      rm: {
        args: ["ref"],
        flags: [],
        usage: ["dek ref rm <ref>"],
        run: async ({ cwd, args }) => {
          const { removeRef } = await import("./ref.ts");
          return removeRef(cwd, args.ref);
        },
      },
    },
    output: { text: formatRef },
  }),
  show: result({
    scope: "deck",
    refs: true,
    args: ["slug"],
    flags: [],
    usage: ["dek show [deck] <slug>"],
    summary: "Print what one slide is made of: its script, HTML, CSS, TS, theme rules, and assets.",
    group: "Slide",
    overview: [["dek show <slug>", "print a slide's script, HTML, CSS, TS, theme rules, assets"]],
    agent: ["dek show <slug>     script, HTML, CSS, TS, the theme rules it uses, assets"],
    run: async ({ target, args }) => {
      const { showCommand } = await import("./show.ts");
      return showCommand(target, args.slug);
    },
    output: { text: formatShow },
  }),
  theme: result({
    scope: "deck",
    refs: true,
    args: ["layout?"],
    flags: [],
    usage: ["dek theme [deck] [layout]"],
    summary: "List the theme's layouts, classes, and tokens, or print one layout's markup.",
    group: "Slide",
    overview: [
      [
        "dek theme [layout]",
        "list the deck theme's layouts, classes, and tokens; print a layout's markup",
      ],
    ],
    agent: [
      "dek theme [layout]  deck theme: layouts, classes, tokens; with a layout, its example markup",
    ],
    run: async ({ target, args }) => {
      const { themeCommand } = await import("./theme.ts");
      return themeCommand(target, args.layout);
    },
    output: {
      text: formatTheme,
      paths: (data, display) => ({ ...data, path: display(data.path) }),
    },
  }),
  check: result({
    scope: "deck",
    args: ["slug"],
    flags: ["shot", "voice"],
    usage: ["dek check [deck] <slug> [--shot] [--voice]"],
    summary: "Lint one slide, rendered rules included when Playwright is installed.",
    group: "Slide",
    overview: [
      ["dek check <slug>", "lint one slide; --shot adds a screenshot; --voice adds readings"],
    ],
    agent: ["dek check <slug> [--shot] [--voice]"],
    run: async ({ target, args, flags }) => {
      const { checkCommand } = await import("./check.ts");
      return checkCommand(target, { slug: args.slug, shot: flags.shot, voice: flags.voice });
    },
    output: {
      text: formatCheck,
      notes: (data, color) => formatSkipped(data.skipped, color) || undefined,
      paths: withDisplayDiagnostics,
      failure: (data) => diagnosticFailure("check", data, `dek check ${data.slug}`),
    },
  }),
  shot: result({
    scope: "deck",
    refs: true,
    args: ["slug?"],
    flags: ["step", "to", "at", "sheet", "motion"],
    usage: [
      "dek shot [deck] [slug] [--step ID|N]",
      "dek shot [deck] --sheet",
      "dek shot [deck] <slug> --motion [--step ID|N]",
      "dek shot [deck] <a> --to <b> [--at 0..1]",
    ],
    summary:
      "Screenshot slides at their last beat, tile the deck on contact sheets, lay out a slide's\nbeats in motion, or take one frame of the transition from a to b.",
    group: "Slide",
    overview: [
      ["dek shot [slug]", "write screenshots; --step <id|n> picks a beat"],
      ["dek shot --sheet", "tile every slide on one image, to judge the deck in one look"],
      ["dek shot <slug> --motion", "each beat held at moments through its motion, on one image"],
      ["dek shot <a> --to <b> [--at 0.5]", "freeze the transition from a into b (morph check)"],
    ],
    agent: [
      "dek shot [slug] [--step <id|n>]",
      "dek shot --sheet    every slide at its last beat on contact sheets sized for one look",
      "dek shot <slug> --motion [--step <id|n>]   a row per beat: 0/25/50/75% of all it moves, then its end",
      "dek shot <a> --to <b> [--at 0..1]   frame of the a→b view transition, default 0.5",
    ],
    run: async ({ target, args, flags }) => {
      const { shotCommand } = await import("./shot.ts");
      return shotCommand(target, {
        slug: args.slug,
        step: flags.step,
        to: flags.to,
        at: flags.at,
        sheet: flags.sheet,
        motion: flags.motion,
      });
    },
    output: { text: formatShot },
  }),
  mv: result({
    scope: "deck",
    args: ["old", "new?"],
    flags: ["before", "after"],
    usage: ["dek mv [deck] <old> <new>", "dek mv [deck] <slug> --before|--after <slug>"],
    summary: "Rename a section and every file named after it, or move it in the script.",
    group: "Slide",
    overview: [
      ["dek mv <old> <new>", "rename a section id and its HTML"],
      ["dek mv <slug> --before|--after <slug>", "reorder a section"],
    ],
    agent: ["dek mv <old> <new> | dek mv <slug> --before|--after <slug>"],
    run: async ({ target, args, flags }) => {
      const { mvCommand } = await import("./mv.ts");
      return mvCommand(target, {
        slug: args.old,
        to: args.new,
        before: flags.before,
        after: flags.after,
      });
    },
    output: { text: formatMv },
  }),
  goto: result({
    scope: "deck",
    args: ["slug"],
    flags: [],
    usage: ["dek goto [deck] <slug>"],
    summary: "Move the open browser to a slide. Needs a running dev server.",
    group: "Slide",
    overview: [["dek goto <slug>", "jump the open browser"]],
    agent: ["dek goto <slug>     requires running dek"],
    run: async ({ target, args }) => {
      const { gotoCommand } = await import("./goto.ts");
      return gotoCommand(target, args.slug);
    },
    output: { text: formatNav, notes: navNotes },
  }),
  current: result({
    scope: "deck",
    args: [],
    flags: [],
    usage: ["dek current [deck]"],
    summary: "Print the slide on screen. Needs a running dev server.",
    group: "Slide",
    overview: [["dek current", "print the slide on screen"]],
    agent: ["dek current         requires running dek"],
    run: async ({ target }) => {
      const { currentCommand } = await import("./goto.ts");
      return currentCommand(target);
    },
    output: { text: formatNav, notes: navNotes },
  }),
  marks: result({
    scope: "deck",
    args: [],
    flags: [],
    usage: ["dek marks [deck]"],
    summary:
      "List the beats marked to rewrite in the presenter view, by pressing m while rehearsing:\nwhere each is in script.md, what it said when marked, and what it says now.",
    group: "Slide",
    overview: [
      ["dek marks", "list the beats marked in the presenter view (m) to rewrite"],
      ["dek marks clear", "drop the deck's marks"],
    ],
    agent: [
      "dek marks [clear]   beats the speaker marked (m) to rewrite: line, was, text, status open|edited|gone",
    ],
    run: async ({ target }) => {
      const { marksCommand } = await import("./marks.ts");
      return marksCommand(target);
    },
    subcommands: {
      clear: {
        args: [],
        flags: [],
        usage: ["dek marks [deck] clear"],
        run: async ({ target }) => {
          const { clearMarksCommand } = await import("./marks.ts");
          return clearMarksCommand(target);
        },
      },
    },
    output: {
      text: formatMarks,
      paths: (data, display) =>
        data.action === "list"
          ? { ...data, marks: data.marks.map((mark) => ({ ...mark, path: display(mark.path) })) }
          : data,
    },
  }),
  sync: result({
    scope: "decks",
    args: [],
    flags: [],
    usage: ["dek sync [deck]"],
    summary:
      "Create a skeleton for each section without slide HTML, refresh the skeletons\nnobody has edited since, and remove the ones whose section is gone.",
    group: "Slide",
    overview: [["dek sync", "create missing skeletons; refresh or drop the ones nobody edited"]],
    agent: [
      "dek sync            create missing skeletons; refresh or drop untouched ones; never edits your slides",
    ],
    run: async ({ target }) => {
      const { syncCommand } = await import("./sync.ts");
      return syncCommand(target);
    },
    output: {
      text: (data) => formatCreated(data.created, data.updated, data.removed),
      notes: (data, color) => formatKept(data.kept, color) || undefined,
      paths: (data, display) => ({
        created: data.created.map(display),
        updated: data.updated.map(display),
        removed: data.removed.map(display),
        kept: data.kept.map(display),
      }),
    },
  }),
  lint: result({
    scope: "decks",
    unreadable: true,
    args: [],
    flags: ["fix", "visual", "format"],
    usage: ["dek lint [deck] [--fix] [--visual] [--format sarif]"],
    summary: "Check the script against the slides. Errors exit 1; warnings alone do not.",
    group: "Output",
    overview: [
      ["dek lint [--fix]", "check script.md against slides; --fix syncs first"],
      ["dek lint --visual", "add overflow and contrast rules"],
      ["dek lint --format sarif", "print diagnostics as SARIF, for code scanning"],
    ],
    agent: ["dek lint [--fix] [--visual] [--format sarif]"],
    run: async ({ cwd, target, flags }) => {
      const { lintCommand } = await import("./lint.ts");
      return lintCommand(target, { cwd, fix: flags.fix, visual: flags.visual });
    },
    output: {
      text: (data, color) => formatDiagnostics(data.diagnostics, { color }),
      notes: (data, color) => formatSkipped(data.skipped, color) || undefined,
      json: ({ rumdlSarif: _rumdlSarif, ...data }) => data,
      paths: withDisplayDiagnostics,
      failure: (data) => diagnosticFailure("lint", data, "dek lint"),
      sarif: (data) => {
        const dek = data.diagnostics.filter((diagnostic) => diagnostic.id.startsWith("DEK"));
        return mergeSarif(toSarif(dek, { skipped: data.skipped ?? [] }), data.rumdlSarif);
      },
    },
  }),
  cues: result({
    scope: "deck",
    args: [],
    flags: [],
    usage: ["dek cues [deck]"],
    summary: "Print the spoken paragraphs as Cue[]. No voice engine needed.",
    group: "Output",
    overview: [["dek cues", "print spoken paragraphs as Cue[]"]],
    agent: ["dek cues"],
    run: async ({ target }) => {
      const { cuesCommand } = await import("./cues.ts");
      return cuesCommand(target);
    },
    output: {
      text: formatCues,
      paths: withDisplayDiagnostics,
    },
  }),
  voice: result({
    scope: "deck",
    args: [],
    flags: [],
    usage: ["dek voice [deck]"],
    summary:
      "Synthesize the sentences that changed, list speakers, speak one sentence, add a reading,\nor pin the audio and timeline.",
    group: "Output",
    overview: [
      ["dek voice", "synthesize changed sentences"],
      ["dek voice speakers", "list engine speakers"],
      ["dek voice say <text>", "speak one sentence"],
      ["dek voice dict add <word> <kana> [--accent N]", "add a reading"],
      ["dek voice pin", "pin TTS master.wav + timeline.json"],
    ],
    agent: ["dek voice [speakers | say <text> | dict add <word> <kana> [--accent N] | pin]"],
    run: async ({ target }) => {
      const { synthVoice } = await import("./voice.ts");
      return synthVoice(target);
    },
    subcommands: {
      speakers: {
        args: [],
        flags: [],
        usage: ["dek voice [deck] speakers"],
        run: async ({ target }) => {
          const { listSpeakers } = await import("./voice.ts");
          return listSpeakers(target);
        },
      },
      say: {
        args: ["text..."],
        flags: [],
        usage: ["dek voice [deck] say <text>"],
        run: async ({ target, args }) => {
          const { sayVoice } = await import("./voice.ts");
          return sayVoice(target, args.text);
        },
      },
      "dict add": {
        args: ["word", "kana"],
        flags: ["accent"],
        usage: ["dek voice [deck] dict add <word> <kana> [--accent N]"],
        run: async ({ target, args, flags }) => {
          const { addReading } = await import("./voice.ts");
          return addReading(target, { word: args.word, kana: args.kana, accent: flags.accent });
        },
      },
      pin: {
        args: [],
        flags: [],
        usage: ["dek voice [deck] pin"],
        run: async ({ target }) => {
          const { pinVoice } = await import("./voice.ts");
          return pinVoice(target);
        },
      },
    },
    output: { text: formatVoice },
  }),
  build: result({
    scope: "decks",
    args: [],
    flags: ["root-dist", "url"],
    usage: ["dek build [deck] [--root-dist] [--url <url>]"],
    summary:
      "Write the whole talk into one HTML file, dist/<deck>.html. Lint never stops a build;\nthe output says what lint found. Given the URL dist/ is served from, the first slide\nalso becomes dist/<deck>.png, the picture a shared link shows.",
    group: "Output",
    overview: [["dek build [--root-dist] [--url <url>]", "write a single HTML file"]],
    agent: ["dek build [--root-dist] [--url <url>]"],
    run: async ({ target, flags }) => {
      const { buildCommand } = await import("./build.ts");
      return buildCommand(target, { rootDist: flags["root-dist"], url: flags.url });
    },
    output: {
      text: formatBuild,
      notes: (data, color) => formatSkipped(data.skipped, color) || undefined,
      paths: withDisplayDiagnostics,
    },
  }),
  video: result({
    scope: "deck",
    args: ["slug?"],
    flags: ["fps", "root-dist"],
    usage: ["dek video [deck] [slug] [--fps N] [--root-dist]"],
    summary: "Bake dist/<deck>.mp4 from the Timeline, or one slide into .cache/video/.",
    group: "Output",
    overview: [
      [
        "dek video [slug] [--fps N] [--root-dist]",
        "bake dist/<deck>.mp4 (or one slide under .cache/video/)",
      ],
    ],
    agent: ["dek video [slug] [--fps N] [--root-dist]"],
    run: async ({ target, args, flags }) => {
      const { videoCommand } = await import("./video.ts");
      return videoCommand(target, {
        slug: args.slug,
        fps: flags.fps,
        rootDist: flags["root-dist"],
      });
    },
    output: { text: formatVideo },
  }),
  pdf: result({
    scope: "decks",
    args: [],
    flags: ["root-dist"],
    usage: ["dek pdf [deck] [--root-dist]"],
    summary: "Write dist/<deck>.pdf, one page per slide at its last beat. Needs Playwright.",
    group: "Output",
    overview: [["dek pdf [--root-dist]", "write a PDF"]],
    agent: ["dek pdf [--root-dist]"],
    run: async ({ target, flags }) => {
      const { pdfCommand } = await import("./pdf.ts");
      return pdfCommand(target, { rootDist: flags["root-dist"] });
    },
    output: { text: formatPdf },
  }),
  help: {
    kind: "help",
    args: ["command?"],
    flags: ["agent"],
    usage: ["dek help [command] [--agent]"],
    summary: "Show every command, or one command's usage and flags.",
    group: "Help",
    overview: [["dek help [command]", "show this help, or one command's usage and flags"]],
    agent: ["dek help [command] | dek <command> --help | dek --version"],
  } satisfies HelpSpec as HelpSpec,
};

type Specs = typeof COMMANDS;

export type CommandName = keyof Specs;

/** The commands that print a result. */
export type ResultCommand = {
  [K in CommandName]: Specs[K] extends { kind: "result" } ? K : never;
}[CommandName];

type DataOf<K extends ResultCommand> = Specs[K] extends ResultSpec<infer D> ? D : never;

/** One command's result, before it is printed. */
export type CliResult = { [K in ResultCommand]: { command: K; data: DataOf<K> } }[ResultCommand];

type PrintedOf<K extends ResultCommand> = NonNullable<Specs[K]["printed"]>;

/**
 * Every command prints what its contract names. A command whose data outgrew its contract fails
 * to compile here, by name; the tests hold the printed lines to the contract field by field.
 */
type BreaksContract = {
  [K in ResultCommand]: PrintedOf<K> extends ResultFields[K] ? never : K;
}[ResultCommand];
const keepsContract: [BreaksContract] extends [never] ? true : BreaksContract = true;
void keepsContract;

export type AnySpec = ResultSpec<unknown> | SessionSpec | HelpSpec;

/** The spec of a command, or nothing for a word that is none. */
function commandSpec(word: string | undefined): AnySpec | undefined {
  return word !== undefined && Object.hasOwn(COMMANDS, word)
    ? (COMMANDS[word as CommandName] as AnySpec)
    : undefined;
}

/** Every spec, in the order `dek help` lists them. */
export function allSpecs(): Array<[CommandName, AnySpec]> {
  return Object.entries(COMMANDS) as Array<[CommandName, AnySpec]>;
}

/** A word the user may type as a command: every command but the bare serve. */
export function isTypedCommand(word: string | undefined): word is CommandName {
  const spec = commandSpec(word);
  return spec !== undefined && spec.bare !== true;
}

export function subcommandsOf(spec: AnySpec): Record<string, SubSpec<unknown>> {
  return spec.kind === "result" ? (spec.subcommands ?? {}) : {};
}

/**
 * The subcommand a command line names, and the index of its first word in `positionals`
 * (the command word is 0). It follows the command, or the deck when the command takes one.
 */
export function subcommandAt(
  name: CommandName,
  positionals: string[],
): { name: string; at: number } | undefined {
  const spec = COMMANDS[name] as AnySpec;
  const starts = spec.scope ? [1, 2] : [1];
  for (const at of starts) {
    for (const sub of Object.keys(subcommandsOf(spec))) {
      const words = sub.split(" ");
      if (words.every((word, index) => positionals[at + index] === word)) {
        return { name: sub, at };
      }
    }
  }
  return undefined;
}

/** The form a command line runs: a subcommand's, or the command's own. */
export function formOf(name: CommandName, sub?: string): Form & Partial<Runs<unknown>> {
  const spec = COMMANDS[name] as AnySpec;
  return (sub === undefined ? undefined : subcommandsOf(spec)[sub]) ?? spec;
}

/** The flags a form takes on top of the global ones: --deck with a scope, then its own. */
export function acceptedFlags(name: CommandName, sub?: string): FlagName[] {
  const spec = COMMANDS[name] as AnySpec;
  return [...(spec.scope ? (["deck"] as const) : []), ...formOf(name, sub).flags];
}

/** Every flag a command takes in any of its forms, for its help. */
export function commandFlags(name: CommandName): FlagName[] {
  const subs = Object.keys(subcommandsOf(COMMANDS[name] as AnySpec));
  return [...new Set([acceptedFlags(name), ...subs.map((sub) => acceptedFlags(name, sub))].flat())];
}

/** Every usage line of a command, its subcommands' included. */
export function usageLines(name: CommandName): string[] {
  const spec = COMMANDS[name] as AnySpec;
  return [spec.usage, ...Object.values(subcommandsOf(spec)).map((sub) => sub.usage)].flat();
}

/** How the result of `command` prints. */
export function outputOf(command: ResultCommand): Output<unknown> {
  return (COMMANDS[command] as ResultSpec<unknown>).output;
}
