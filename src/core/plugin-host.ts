import { existsSync, realpathSync } from "node:fs";
import { delimiter, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import pkg from "../../package.json";
import type { CheckInput } from "../plugin-api.ts";
import { loadConfig } from "./config.ts";
import { type Diagnostic, diag, type SkippedCheck } from "./diagnostic.ts";
import { DekError } from "./error.ts";
import { foreignLine } from "./foreign-text.ts";
import {
  CHECK_PROTOCOL,
  lockText,
  type ManifestReading,
  manifestChanges,
  type PinnedPlugin,
  type PluginManifest,
  type PluginPage,
  readLock,
  readManifest,
} from "./plugin.ts";
import type { Project, ProjectDeck } from "./resolve.ts";
import { readSourceIfExists, writeInside } from "./safe-fs.ts";
import { slugAtLine } from "./script-lines.ts";
import { OverrunError, runPiped, workerCommand } from "./spawn.ts";

/**
 * Running the plugins a project names: finding each `dek-<name>`, asking it for its manifest,
 * pinning what it said, and having it check a deck. A plugin runs in a process of its own with the
 * user's privileges; that keeps a crash out of dek, not what the plugin may do. See ADR 32.
 */

/** A manifest is a constant to print; a run this long is one that hangs. */
const MANIFEST_TIMEOUT_MS = 10 * 1000;
/** As long as rumdl gets: a check reads one deck. */
const CHECK_TIMEOUT_MS = 30 * 1000;
/** The longest a plugin's message or hint shows: its own words, kept to one line of dek's. */
const PLUGIN_TEXT_MAX = 300;

/** A plugin dek can run: where it is and the manifest it is held to. */
export type ReadyPlugin = { name: string; bin: string; manifest: PluginManifest };

/** What `dek-<name> manifest` printed: a manifest dek can use, or why there is none. */
export type Described =
  | ({ state: "ready" } & ReadyPlugin)
  | { state: "missing"; name: string }
  | { state: "broken"; name: string; bin: string; reason: string; unsupported?: true };

function binName(name: string): string {
  return `dek-${name}`;
}

/**
 * The plugins dek ships, by name (ADR 34). Each runs from dek's own files, in a bun of its own as
 * any plugin does, and never from PATH: its code is the dek the project installed, which the
 * project's lockfile pins.
 */
const BUNDLED: Record<string, { main: string; page?: string; guide: string }> = {
  study: bundled("study", { page: true }),
  words: bundled("words", { page: false }),
};

function bundled(
  name: string,
  { page }: { page: boolean },
): { main: string; page?: string; guide: string } {
  const dir = join(import.meta.dir, "..", "plugins", name);
  return {
    main: join(dir, "main.ts"),
    ...(page ? { page: join(dir, "page.ts") } : {}),
    guide: `https://hajimism.github.io/dek/reference/plugins.html#dek-${name}`,
  };
}

/** The page of each plugin dek ships with one, as a file to compile for the browser (ADR 34). */
export function bundledPageEntries(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(BUNDLED).flatMap(([name, { page }]) => (page ? [[name, page]] : [])),
  );
}

/**
 * A plugin dek ships, from dek's own files; otherwise
 * `dek-<name>` on the user's PATH, as an absolute path to start it by. A PATH entry that is
 * relative, or whose real path is in the project, is passed over: bunx, direnv, and mise put a
 * project's own folders there, and a project may choose among the plugins the user installed but
 * never add one. On Windows only an `.exe` is taken, so no script runs through a shell.
 */
export function resolvePluginBin(name: string, root: string): string | undefined {
  const own = BUNDLED[name];
  if (own !== undefined) {
    return own.main;
  }
  const project = realOrUndefined(root) ?? resolve(root);
  const entries = pathEntries().filter((entry) => !passedOver(entry, project));
  const found = Bun.which(binName(name), { PATH: entries.join(delimiter) }) ?? undefined;
  if (found && process.platform === "win32" && extname(found).toLowerCase() !== ".exe") {
    return undefined;
  }
  return found;
}

function pathEntries(): string[] {
  return (process.env.PATH ?? "").split(delimiter).filter((entry) => entry !== "");
}

/** A PATH entry dek never takes a plugin from: a relative one, or one whose real path is in the project. */
function passedOver(entry: string, project: string): boolean {
  if (!isAbsolute(entry)) {
    return true;
  }
  const real = realOrUndefined(entry);
  return real === undefined || real === project || real.startsWith(`${project}${sep}`);
}

/**
 * Why a plugin is missing, and what to do: one installed inside the project, in its
 * `node_modules/.bin` or a folder on PATH there, is named where it is, since that is where an
 * install for a JavaScript project puts it, and dek's not finding it would otherwise make no sense.
 */
function missingPlugin(
  name: string,
  root: string,
  version?: string,
): { reason: string; hint: string; inside?: true } {
  const project = realOrUndefined(root) ?? resolve(root);
  const inside = [
    join(project, "node_modules", ".bin"),
    ...pathEntries()
      .filter((entry) => passedOver(entry, project))
      .map((entry) => resolve(entry)),
  ];
  const found = Bun.which(binName(name), { PATH: inside.join(delimiter) });
  if (found) {
    const where = relative(project, dirname(realOrUndefined(found) ?? found))
      .split(sep)
      .join("/");
    return {
      reason: `${binName(name)} is in ${where || "."}, inside the project, where dek never runs a plugin from`,
      hint: "install it outside the project, as `bun add -g` does, so that it is on PATH",
      inside: true,
    };
  }
  return {
    reason: `${binName(name)} is not installed`,
    hint: `install ${binName(name)}${version ? ` ${version}` : ""} on PATH, outside this project`,
  };
}

function reasonAndHint({ reason, hint }: { reason: string; hint: string }) {
  return { reason, hint };
}

function realOrUndefined(path: string): string | undefined {
  try {
    return realpathSync(path);
  } catch {
    return undefined;
  }
}

/**
 * Runs `dek-<name> manifest` and checks what it prints. Nothing caches it: each command that
 * needs a manifest asks once per plugin, and a manifest is a constant.
 */
export async function installedManifest(
  name: string,
  root: string,
  options: { timeoutMs?: number } = {},
): Promise<Described> {
  const bin = resolvePluginBin(name, root);
  if (!bin) {
    return { state: "missing", name };
  }
  const broken = (reason: string, unsupported?: true): Described => ({
    state: "broken",
    name,
    bin,
    reason: `manifest ${reason}`,
    ...(unsupported ? { unsupported } : {}),
  });
  const timeoutMs = options.timeoutMs ?? MANIFEST_TIMEOUT_MS;
  let printed: string;
  try {
    const run = await runPiped(workerCommand(bin, ["manifest"]), {
      label: `${binName(name)} manifest failed`,
      hint: "",
      cwd: root,
      timeoutMs,
    });
    if (run.exitCode !== 0) {
      return broken(`exited ${run.exitCode}${stderrLine(run.stderr)}`);
    }
    printed = run.stdout;
  } catch (error) {
    return broken(
      error instanceof OverrunError
        ? `did not finish within ${timeoutMs / 1000}s and was stopped`
        : "could not start",
    );
  }
  let value: unknown;
  try {
    value = JSON.parse(printed);
  } catch {
    return broken("printed something other than JSON");
  }
  const reading = readManifest(value, name);
  if (!reading.ok) {
    return broken(`printed a manifest dek cannot use: ${reading.reason}`, reading.unsupported);
  }
  return { state: "ready", name, bin, manifest: reading.manifest };
}

function stderrLine(stderr: string): string {
  const line = stderr.split("\n").find((text) => text.trim() !== "");
  return line === undefined ? "" : `: ${foreignLine(line, PLUGIN_TEXT_MAX)}`;
}

/** The data files a manifest declares in the deck, leaving out the project's (ADR 35). */
export function deckData(manifest: PluginManifest): Array<{ path: string }> {
  return (manifest.data ?? []).filter((entry) => entry.in === undefined);
}

/** `plugins/<name>/` in the project: the lock, and the data the plugin keeps for the whole project. */
function pluginDir(root: string, name: string): string {
  return join(root, "plugins", name);
}

/**
 * Whether a finding is on a file in the plugin's own `plugins/<name>/`, which every deck's check
 * reads alike, so lint reports it once (ADR 35). A finding on a deck, or on none, is each deck's.
 */
export function onProjectData(finding: Diagnostic, root: string, name: string): boolean {
  return finding.path !== undefined && inside(pluginDir(root, name), finding.path) !== undefined;
}

/** `path` relative to `dir` when it is inside it, as `location` reads a finding's place. */
function inside(dir: string, path: string): string | undefined {
  const within = relative(dir, path);
  return within === "" || within.startsWith("..") || isAbsolute(within) ? undefined : within;
}

/** What the plugin reads on stdin: the deck, as the published schema says, not dek's own types. */
function checkInput(deck: ProjectDeck, dir: string): string {
  const relativeIfThere = (path: string) =>
    existsSync(path) ? relative(deck.dir, path).split(sep).join("/") : null;
  // Typed as published, so the shape a plugin reads cannot drift from @hajimism/dek/plugin.
  const input: CheckInput = {
    protocol: CHECK_PROTOCOL,
    dek: pkg.version,
    deck: {
      name: deck.name,
      lang: deck.deck.lang,
      slides: deck.deck.sections.map((section) => ({
        slug: section.slug,
        title: section.title,
        html: relativeIfThere(join(deck.dir, "slides", `${section.slug}.html`)),
        css: relativeIfThere(join(deck.dir, "slides", `${section.slug}.css`)),
        ts: relativeIfThere(join(deck.dir, "slides", `${section.slug}.ts`)),
      })),
    },
    // Absolute: a deck reached through a link would lead a relative path elsewhere (ADR 35).
    pluginDir: dir,
  };
  return JSON.stringify(input);
}

/** A check's findings on one deck; `hung` when it was stopped, so lint runs it on no deck after. */
export type CheckOutcome = { diagnostics: Diagnostic[]; hung?: true };

/**
 * Runs `dek-<name> check` on one deck and reads its SARIF as dek's diagnostics: the rule id it
 * declared, the severity its manifest gives that id, and a location inside the deck. A plugin that
 * fails is DEK046, never an empty pass.
 */
export async function checkDeck(
  plugin: ReadyPlugin,
  project: Project,
  deck: ProjectDeck,
  options: { timeoutMs?: number } = {},
): Promise<CheckOutcome> {
  const failed = (what: string) =>
    pluginFailure(
      plugin.name,
      plugin.manifest.version,
      `check on ${deck.name} ${what}`,
      project.configPath,
    );
  const timeoutMs = options.timeoutMs ?? CHECK_TIMEOUT_MS;
  let stdout: string;
  try {
    const run = await runPiped(
      workerCommand(plugin.bin, ["check", "--protocol", String(CHECK_PROTOCOL)]),
      {
        label: `${binName(plugin.name)} check failed`,
        hint: "",
        stdin: checkInput(deck, pluginDir(project.root, plugin.name)),
        cwd: deck.dir,
        timeoutMs,
      },
    );
    if (run.exitCode !== 0) {
      return { diagnostics: [failed(`exited ${run.exitCode}${stderrLine(run.stderr)}`)] };
    }
    stdout = run.stdout;
  } catch (error) {
    if (error instanceof OverrunError) {
      return {
        diagnostics: [failed(`did not finish within ${timeoutMs / 1000}s and was stopped`)],
        hung: true,
      };
    }
    return { diagnostics: [failed("could not start")] };
  }
  const read = readSarif(stdout, plugin, deck, pluginDir(project.root, plugin.name));
  return typeof read === "string" ? { diagnostics: [failed(read)] } : { diagnostics: read };
}

/**
 * DEK046: a plugin the project pinned failed, named with the version it was pinned at. The deck is
 * not at fault, so the hint is to tell the user; the finding still fails lint, since the checks the
 * plugin makes did not run.
 */
function pluginFailure(
  name: string,
  version: string,
  what: string,
  configPath: string,
): Diagnostic {
  return diag("DEK046", {
    message: `${binName(name)} ${version} ${what}`,
    path: configPath,
    hint: `the plugin failed, not the deck: tell the user, who can update ${binName(name)} or report it to its author`,
    data: { plugin: name, version },
  });
}

type SarifResult = {
  ruleId?: unknown;
  message?: { text?: unknown };
  locations?: Array<{
    physicalLocation?: {
      artifactLocation?: { uri?: unknown };
      region?: { startLine?: unknown; startColumn?: unknown };
    };
  }>;
  properties?: { hint?: unknown };
};

/**
 * The findings in a check's SARIF, or what is wrong with it, as the end of a DEK046 message. A
 * relative location is read against the deck's folder; `ownDir` is the plugin's own.
 */
function readSarif(
  stdout: string,
  plugin: ReadyPlugin,
  deck: ProjectDeck,
  ownDir: string,
): Diagnostic[] | string {
  let log: unknown;
  try {
    log = JSON.parse(stdout);
  } catch {
    return "printed something other than SARIF";
  }
  const runs = (log as { runs?: unknown } | null)?.runs;
  if (!Array.isArray(runs)) {
    return "printed SARIF with no runs";
  }
  const rules = plugin.manifest.check?.rules ?? {};
  const diagnostics: Diagnostic[] = [];
  for (const run of runs) {
    const results = (run as { results?: unknown } | null)?.results ?? [];
    if (!Array.isArray(results)) {
      return "printed SARIF whose results are not a list";
    }
    for (const result of results as SarifResult[]) {
      const id = typeof result?.ruleId === "string" ? result.ruleId : undefined;
      const rule = id === undefined ? undefined : rules[id];
      if (id === undefined || rule === undefined) {
        const named = id === undefined ? "a finding with no rule id" : foreignLine(id, 40);
        return `reported ${named}, which its manifest does not declare`;
      }
      const text = result.message?.text;
      if (typeof text !== "string" || text.trim() === "") {
        return `reported ${id} with no message`;
      }
      const hint = result.properties?.hint;
      diagnostics.push({
        id,
        severity: rule.severity,
        message: foreignLine(text, PLUGIN_TEXT_MAX),
        ...location(result, deck, ownDir),
        ...(typeof hint === "string" && hint.trim() !== ""
          ? { hint: foreignLine(hint, PLUGIN_TEXT_MAX) }
          : {}),
      });
    }
  }
  return diagnostics;
}

/**
 * Where a finding is, from its first location: a path relative to the deck, or a file URL, inside
 * the deck or the plugin's own `plugins/<name>/` (ADR 35). A location anywhere else is dropped,
 * never shown as a file to change. A finding in a slide's files, or in its section of script.md,
 * is on that slide, as dek's own are.
 */
function location(
  result: SarifResult,
  deck: ProjectDeck,
  ownDir: string,
): Pick<Diagnostic, "path" | "line" | "column" | "slug"> {
  const physical = result.locations?.[0]?.physicalLocation;
  const uri = physical?.artifactLocation?.uri;
  if (typeof uri !== "string") {
    return {};
  }
  let path: string;
  try {
    path = uri.startsWith("file:") ? fileURLToPath(uri) : resolve(deck.dir, decodeURI(uri));
  } catch {
    return {};
  }
  const inDeck = inside(deck.dir, path)?.split(sep).join("/");
  if (inDeck === undefined && inside(ownDir, path) === undefined) {
    return {};
  }
  const line = positive(physical?.region?.startLine);
  const column = line === undefined ? undefined : positive(physical?.region?.startColumn);
  const slug =
    inDeck === "script.md" && line !== undefined
      ? slugAtLine(deck.deck.sections, line)
      : inDeck?.match(/^slides\/([^/]+)\.(?:html|css|ts)$/)?.[1];
  return {
    path,
    ...(line === undefined ? {} : { line }),
    ...(column === undefined ? {} : { column }),
    ...(slug === undefined ? {} : { slug }),
  };
}

function positive(value: unknown): number | undefined {
  return Number.isInteger(value) && (value as number) >= 1 ? (value as number) : undefined;
}

/** The plugins dek.toml names; none when it names none or does not parse, which lint reports. */
function namedPlugins(project: { configPath: string }): string[] {
  try {
    return loadConfig(project.configPath).plugins ?? [];
  } catch {
    return [];
  }
}

function lockPath(root: string, name: string): string {
  return join(root, "plugins", name, "plugin.json");
}

function lockRelative(name: string): string {
  return `plugins/${name}/plugin.json`;
}

/** The lock's text and what it pins, or undefined when the project has none. */
function readPluginLock(
  root: string,
  name: string,
): { text: string; reading: ManifestReading } | undefined {
  const text = readSourceIfExists(lockPath(root, name), root);
  return text === undefined ? undefined : { text, reading: readLock(text, name) };
}

/**
 * The plugins `dekc lint` runs, each as the project accepted it, and the ones it cannot run with
 * why. A plugin whose manifest differs from its lock is skipped, so a check nobody accepted never
 * runs, and CI and a laptop run the same checks or say they did not.
 */
export async function pluginChecks(
  project: Project,
): Promise<{ ready: ReadyPlugin[]; skipped: SkippedCheck[]; diagnostics: Diagnostic[] }> {
  const ready: ReadyPlugin[] = [];
  const skipped: SkippedCheck[] = [];
  const diagnostics: Diagnostic[] = [];
  for (const name of namedPlugins(project)) {
    const skip = (reason: string, hint: string) =>
      skipped.push({ check: "plugin", plugin: name, reason, hint });
    const lock = readPluginLock(project.root, name);
    if (lock === undefined) {
      const installed = resolvePluginBin(name, project.root) !== undefined;
      const missing = missingPlugin(name, project.root);
      if (!installed && missing.inside) {
        skip(missing.reason, missing.hint);
        continue;
      }
      skip(
        `${lockRelative(name)} is missing, so nothing pins what ${binName(name)} may check`,
        installed
          ? "run `dekc sync` to pin it"
          : `install ${binName(name)}, then run \`dekc sync\` to pin it`,
      );
      continue;
    }
    if (!lock.reading.ok) {
      skip(
        `${lockRelative(name)} is not one this dek can read: ${lock.reading.reason}`,
        lock.reading.unsupported
          ? "update dek"
          : `run \`dekc sync --accept ${name}\` to pin the installed ${binName(name)} again`,
      );
      continue;
    }
    const pinned = lock.reading.manifest;
    if (!pinned.check) {
      continue;
    }
    const installed = await installedManifest(name, project.root);
    if (installed.state === "missing") {
      const missing = missingPlugin(name, project.root, pinned.version);
      skip(missing.reason, missing.hint);
      continue;
    }
    if (installed.state === "broken") {
      // One that needs a newer dek is not broken; this dek cannot read it.
      if (installed.unsupported) {
        skip(`${binName(name)} ${installed.reason}`, "update dek");
      } else {
        diagnostics.push(pluginFailure(name, pinned.version, installed.reason, project.configPath));
      }
      continue;
    }
    const changes = manifestChanges(pinned, installed.manifest);
    if (changes.length > 0) {
      skip(
        `the installed ${binName(name)} is not the one ${lockRelative(name)} pins: ${changes.join("; ")}`,
        `run \`dekc sync\` to see what changed; the user accepts it with \`dekc sync --accept ${name}\``,
      );
      continue;
    }
    ready.push({ name, bin: installed.bin, manifest: pinned });
  }
  return { ready, skipped, diagnostics };
}

/**
 * The plugins' findings for `dekc check` on one slide, and the plugins that did not run. Each
 * pinned plugin checks the deck, as lint has it, and the slide keeps what is on it. It also keeps
 * an error on no slide, such as data that does not read or a plugin that failed: the slide's
 * check may rest on it, and leaving it out would pass a slide no plugin checked.
 */
export async function checkSlide(
  project: Project,
  deck: ProjectDeck,
  slug: string,
): Promise<{ diagnostics: Diagnostic[]; skipped: SkippedCheck[] }> {
  const plugins = await pluginChecks(project);
  const outcomes = await Promise.all(
    plugins.ready.map((plugin) => checkDeck(plugin, project, deck)),
  );
  const diagnostics = [
    ...plugins.diagnostics,
    ...outcomes.flatMap((outcome) => outcome.diagnostics),
  ].filter((found) =>
    found.slug === undefined ? found.severity === "error" : found.slug === slug,
  );
  return { diagnostics, skipped: plugins.skipped };
}

/** What `dekc sync` did with one plugin, for its `--json` and its notes. */
export type PluginSync = {
  name: string;
  status: "accepted" | "current" | "changed" | "missing" | "invalid" | "unsupported";
  /** The installed plugin's version, when it printed a manifest dek can use. */
  version?: string;
  /** For `changed`: what differs from the lock, in dek's words. */
  changes?: string[];
  reason?: string;
  hint?: string;
};

/**
 * Pins each plugin dek.toml names: a plugin with no lock is accepted, since naming it in
 * `[plugins]` was the choice, and one whose manifest changed is shown and left as it was pinned
 * unless `accept` names it. A plugin dek cannot find or read is reported and nothing is written for
 * it. Only `dekc sync` runs this: the dev server's sync on save runs no plugin.
 */
export async function syncPlugins(
  project: Project,
  options: { accept?: string } = {},
): Promise<{ plugins: PluginSync[]; created: string[]; updated: string[] }> {
  const names = namedPlugins(project);
  if (options.accept !== undefined && !names.includes(options.accept)) {
    throw new DekError(`dek.toml names no plugin \`${foreignLine(options.accept, 40)}\``, {
      hint:
        names.length > 0
          ? `accept one of ${names.map((name) => `\`${name}\``).join(", ")}`
          : `add \`[plugins.<name>]\` to dek.toml first`,
    });
  }
  const plugins: PluginSync[] = [];
  const created: string[] = [];
  const updated: string[] = [];
  for (const name of names) {
    const installed = await installedManifest(name, project.root);
    if (installed.state === "missing") {
      const pinned = readPluginLock(project.root, name)?.reading;
      plugins.push({
        name,
        status: "missing",
        ...reasonAndHint(
          missingPlugin(name, project.root, pinned?.ok ? pinned.manifest.version : undefined),
        ),
      });
      continue;
    }
    if (installed.state === "broken") {
      plugins.push({
        name,
        status: installed.unsupported ? "unsupported" : "invalid",
        reason: `${binName(name)} ${installed.reason}`,
        hint: installed.unsupported
          ? "update dek"
          : `tell the user: ${binName(name)} is broken, and its author can fix it`,
      });
      continue;
    }
    const path = lockPath(project.root, name);
    const lock = readPluginLock(project.root, name);
    const pinned = lock?.reading.ok ? lock.reading.manifest : undefined;
    const changes = pinned ? manifestChanges(pinned, installed.manifest) : [];
    const version = installed.manifest.version;
    if (pinned && changes.length === 0) {
      plugins.push({ name, status: "current", version });
      continue;
    }
    if (lock && options.accept !== name) {
      plugins.push({
        name,
        status: "changed",
        version,
        ...(pinned
          ? { changes }
          : { reason: `${lockRelative(name)} is not one this dek can read` }),
        hint: `the user accepts it with \`dekc sync --accept ${name}\``,
      });
      continue;
    }
    writeInside(path, lockText(installed.manifest), project.root);
    (lock ? updated : created).push(path);
    plugins.push({ name, status: "accepted", version });
  }
  return { plugins, created, updated };
}

/**
 * Each plugin dek.toml names, with what its lock pins, read without running anything: AGENTS.md is
 * written from this on every sync, the dev server's included. Empty when dek.toml does not parse.
 */
export function pinnedPlugins(root: string): PinnedPlugin[] {
  return namedPlugins({ configPath: join(root, "dek.toml") }).map((name) => {
    let reading: ManifestReading | undefined;
    try {
      reading = readPluginLock(root, name)?.reading;
    } catch {
      reading = undefined;
    }
    const guide = BUNDLED[name]?.guide;
    return {
      name,
      manifest: reading?.ok ? reading.manifest : undefined,
      ...(guide === undefined ? {} : { guide }),
    };
  });
}

/**
 * The page of each plugin the project pinned with one, for the player and the build: its compiled
 * `script`, the keys its lock declares, and each declared data file the deck has. Only a plugin
 * `scripts` has a page for gets one, so a page dek was not given never reaches a deck (ADR 33). The
 * scripts are those of the plugins dek ships (ADR 34).
 */
export function pluginPages(
  root: string,
  deckDir: string,
  scripts: Record<string, string>,
): PluginPage[] {
  return pinnedPlugins(root).flatMap(({ name, manifest }) => {
    const script = scripts[name];
    if (!manifest?.page || script === undefined) {
      return [];
    }
    const data: PluginPage["data"] = {};
    // A page gets the deck's data alone; the project's is the check's (ADR 35).
    for (const { path } of deckData(manifest)) {
      let text: string | undefined;
      try {
        text = readSourceIfExists(join(deckDir, path), root);
      } catch {
        text = undefined;
      }
      if (text !== undefined) {
        data[path] = {
          text,
          version: new Bun.CryptoHasher("sha256").update(text).digest("hex").slice(0, 16),
        };
      }
    }
    return [{ name, keys: manifest.page.keys ?? [], script, data }];
  });
}
