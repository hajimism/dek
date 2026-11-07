/// <reference lib="dom" />

/**
 * The types a dek plugin is written against, published as `@hajimism/dek/plugin` (ADR 32). They
 * are types only: a plugin runs in a process of its own and shares no code with dek, only these
 * shapes, which travel as JSON. Each grows only by adding; a change to one is a new `schema` or
 * `protocol`.
 */

export type Severity = "error" | "warning";

/** One rule a check can report. Only `error` fails `dekc lint`. */
export type PluginRule = {
  severity: Severity;
  /** One line of fact, at most 120 characters; dek shows it only in SARIF's rule list. */
  summary: string;
};

/** A plugin's rules by id: `<PREFIX>` and three digits, the prefix the name in capitals with `_` for `-`. */
export type PluginRules<Prefix extends string = string> = Record<`${Prefix}${number}`, PluginRule>;

/** What `dek-<name> manifest` prints: the promise the project pins in `plugins/<name>/plugin.json`. */
export type PluginManifest<Prefix extends string = string> = {
  schema: 1;
  /** The `<name>` of `dek-<name>`. */
  name: string;
  /** Letters, digits, `.`, `+`, and `-`, at most 64 characters. */
  version: string;
  /** Without it, dek runs no check. */
  check?: { protocol: 1; rules: PluginRules<Prefix> };
  /** A page in the player and the build, which calls `dek.plugin` (page API 1). */
  page?: {
    api: 1;
    /** Single letters the page binds; none of dek's own (a f l m p s). */
    keys?: string[];
  };
  /**
   * Files the plugin reads, which AGENTS.md names: relative to the deck's folder, or, with
   * `in: "project"`, to `plugins/<name>/` in the project, for data the whole project shares. Only
   * the deck's are served to a page.
   */
  data?: Array<{ path: string; in?: "project" }>;
};

/** One slide of the deck, as `check` reads it. Each path is relative to the deck's folder, or null when the file is not there. */
export type CheckSlide = {
  slug: string;
  title: string;
  html: string | null;
  css: string | null;
  ts: string | null;
};

/** What `dek-<name> check --protocol 1` reads on stdin, run in the deck's folder. */
export type CheckInput = {
  protocol: 1;
  /** The version of the dek that runs the check. */
  dek: string;
  deck: { name: string; lang: string; slides: CheckSlide[] };
  /**
   * The absolute path of `plugins/<name>/` in the project, where the project's data files are,
   * whether or not the folder exists (ADR 35). An older dek does not send it: read that as no
   * project data.
   */
  pluginDir?: string;
};

/** One finding in a check's SARIF: the fields dek reads, and no others. */
export type CheckResult<RuleId extends string = string> = {
  /** A rule the manifest declares; its severity is the manifest's, whatever `level` says. */
  ruleId: RuleId;
  message: { text: string };
  locations?: Array<{
    physicalLocation: {
      /**
       * Relative to the deck's folder, or a `file:` URL inside it or inside `pluginDir`. dek drops
       * a location anywhere else.
       */
      artifactLocation: { uri: string };
      region?: { startLine: number; startColumn?: number };
    };
  }>;
  /** What to do next. */
  properties?: { hint?: string };
};

/** What `dek-<name> check` prints on stdout: SARIF 2.1.0, of which dek reads each run's results. */
export type CheckOutput<RuleId extends string = string> = {
  version: "2.1.0";
  $schema?: string;
  runs: Array<{
    tool?: { driver: { name: string; version?: string } };
    results: Array<CheckResult<RuleId>>;
  }>;
};

/** Where the deck stands: the slide, its index, and the beat (0 is the slide's arrival). */
export type PagePosition = { slug: string; index: number; beat: number };

/**
 * A slide drawn on the stage, for a page to draw over. `root` is the slide, to read and never to
 * change: lint checked what is in it. `layer` lies over the slide, in the slide's own pixels, and
 * is the plugin's alone. A slide a live reload replaced is mounted again.
 */
export type PageMount = { slug: string; root: HTMLElement; layer: ShadowRoot; view: "stage" };

/** What `dek.plugin` hands a plugin's page: page API 1. */
export type PageApi = {
  deck: { name: string };
  slides: Array<{ slug: string; title: string }>;
  current(): PagePosition;
  /** After the deck settles at a position, at the start and after every move, wherever it came from. */
  on(event: "change", listener: (position: PagePosition) => void): void;
  on(event: "mount", listener: (mount: PageMount) => void): void;
  /** Whether `element` shows at the current beat: no beat that hides it is still to come. */
  shown(element: Element): boolean;
  /** A data file the manifest declares, as the project has it; `version` changes with the text. */
  data(path: string): { text: string; version: string } | null;
  /** Binds a key the manifest declares; false for any other. */
  key(letter: string, listener: () => void): boolean;
};

/** The one global a plugin's page touches. */
export type DekPage = {
  plugin(name: string, options: { api: 1 }, setup: (api: PageApi) => void): void;
};
