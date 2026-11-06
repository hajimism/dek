import { z } from "zod";
import { formatZodIssues } from "./zod.ts";

/**
 * A plugin is an executable `dek-<name>` the user installed. It prints a manifest of what it promises,
 * which dek checks and the project pins in `plugins/<name>/plugin.json`, and it checks a deck in a
 * process of its own, answering in SARIF. This file is the part with no I/O: what a manifest may
 * say, the lock it is pinned in, and the words dek writes about it. See ADR 32.
 */

/** The manifest schema and check protocol this dek reads; a plugin that needs a newer one is skipped. */
const MANIFEST_SCHEMA = 1;
export const CHECK_PROTOCOL = 1;
/** The page API this dek gives a plugin's page (ADR 33). */
const PAGE_API = 1;

/** The letters the player binds, which no plugin's page may take; a test reads them from the runtime. */
export const DEK_KEYS: readonly string[] = ["a", "f", "l", "m", "p", "s"];

const NAME_RE = /^[a-z][a-z0-9-]*$/;
const NAME_MAX = 40;

/** Names whose rule ids would read as another tool's: dek's own, and rumdl's MD rules. */
const RESERVED_NAMES: Record<string, string> = {
  dek: "DEK is the prefix of dek's own rules",
  md: "MD is the prefix of rumdl's rules",
};

/** What is wrong with `name` as a plugin's, or undefined when it is one. */
export function pluginNameProblem(name: string): string | undefined {
  if (!NAME_RE.test(name) || name.length > NAME_MAX) {
    return `a plugin's name is a lowercase letter, then lowercase letters, digits, and hyphens, at most ${NAME_MAX}`;
  }
  const reserved = RESERVED_NAMES[name];
  return reserved === undefined ? undefined : `\`${name}\` is not a plugin's name: ${reserved}`;
}

/** The prefix of a plugin's rule ids: `acme-talks` checks ACME_TALKS001 and on. */
export function rulePrefix(name: string): string {
  return name.toUpperCase().replaceAll("-", "_");
}

/** A rule's summary: one line of fact, which dek shows only where a tool lists rules, as SARIF. */
const SUMMARY_MAX = 120;
const VERSION_RE = /^[0-9A-Za-z][0-9A-Za-z.+-]{0,63}$/;

/** The first folders of a deck that are dek's, and the files at its top, in lowercase. */
const DEK_DECK_ENTRIES = new Set(["script.md", "theme.css", "slides", "assets", "voice", "dist"]);

const Rule = z.object({
  severity: z.enum(["error", "warning"]),
  summary: z
    .string()
    .min(1)
    .max(SUMMARY_MAX)
    // Control characters, and the line and paragraph separators, would end the line.
    .refine((text) => !/[\p{Cc}\p{Zl}\p{Zp}]/u.test(text), "summary: one line"),
});

const Check = z.object({
  protocol: z.literal(CHECK_PROTOCOL),
  rules: z.record(z.string(), Rule),
});

const Data = z.object({ path: z.string() });

/** A page in the player and the build. Its script is the plugin's to ship; this dek reads only these. */
const Page = z.object({
  api: z.literal(PAGE_API),
  keys: z.array(z.string()).optional(),
});

/** A manifest as this dek reads it. Fields it does not know are dropped, never passed on. */
const Manifest = z.object({
  schema: z.literal(MANIFEST_SCHEMA),
  name: z.string(),
  version: z.string().regex(VERSION_RE, "version: one token of letters, digits, and . + -"),
  check: Check.optional(),
  page: Page.optional(),
  data: z.array(Data).optional(),
});

export type PluginManifest = z.output<typeof Manifest>;
type PluginRule = z.output<typeof Rule>;

/** A manifest dek can use, or why not; `unsupported` when it asks for a newer dek. */
export type ManifestReading =
  | { ok: true; manifest: PluginManifest }
  | { ok: false; reason: string; unsupported?: true };

/**
 * What `dek-<name> manifest` printed, checked: its shape and versions, that it names the plugin
 * dek ran, that every rule id has the plugin's prefix, and that each data file is the deck's own
 * and not dek's. Only what this dek knows is kept, so the lock pins what it can act on.
 */
export function readManifest(value: unknown, name: string): ManifestReading {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, reason: "the manifest is not a JSON object" };
  }
  const fields = value as Record<string, unknown>;
  if (above(fields.schema, MANIFEST_SCHEMA)) {
    return newer(`manifest schema ${fields.schema}`);
  }
  const check = fields.check as Record<string, unknown> | undefined;
  if (typeof check === "object" && check !== null && above(check.protocol, CHECK_PROTOCOL)) {
    return newer(`check protocol ${check.protocol}`);
  }
  const page = fields.page as Record<string, unknown> | undefined;
  if (typeof page === "object" && page !== null && above(page.api, PAGE_API)) {
    return newer(`page API ${page.api}`);
  }
  const parsed = Manifest.safeParse(value);
  if (!parsed.success) {
    return { ok: false, reason: formatZodIssues(parsed.error) };
  }
  const manifest = parsed.data;
  const problem =
    (manifest.name === name
      ? undefined
      : `it names itself \`${manifest.name}\`, not \`${name}\``) ??
    ruleProblem(manifest, name) ??
    keyProblem(manifest) ??
    dataProblem(manifest);
  return problem === undefined
    ? { ok: true, manifest: canonical(manifest) }
    : { ok: false, reason: problem };
}

/** A version a later dek may read: a whole number past this dek's. Any other is malformed. */
function above(version: unknown, supported: number): version is number {
  return Number.isInteger(version) && (version as number) > supported;
}

function newer(what: string): ManifestReading {
  return {
    ok: false,
    unsupported: true,
    reason: `it needs ${what}; this dek reads manifest schema ${MANIFEST_SCHEMA}, check protocol ${CHECK_PROTOCOL}, and page API ${PAGE_API}`,
  };
}

/** A page's keys are single lowercase letters, each once, none of them the player's. */
function keyProblem(manifest: PluginManifest): string | undefined {
  const keys = manifest.page?.keys ?? [];
  const wrong = keys.find((key) => !/^[a-z]$/.test(key));
  if (wrong !== undefined) {
    return "page.keys: a key is one lowercase letter, a to z";
  }
  const taken = keys.find((key) => DEK_KEYS.includes(key));
  if (taken !== undefined) {
    return `page.keys: \`${taken}\` is a key of dek's player; take a letter other than ${DEK_KEYS.join(" ")}`;
  }
  const twice = keys.find((key, index) => keys.indexOf(key) !== index);
  return twice === undefined ? undefined : `page.keys: \`${twice}\` is named twice`;
}

function ruleProblem(manifest: PluginManifest, name: string): string | undefined {
  const prefix = rulePrefix(name);
  const id = new RegExp(`^${prefix}\\d{3}$`);
  const wrong = Object.keys(manifest.check?.rules ?? {}).find((rule) => !id.test(rule));
  return wrong === undefined
    ? undefined
    : `check.rules: \`${wrong}\` is no rule id of this plugin's; write ${prefix} and three digits, like ${prefix}001`;
}

function dataProblem(manifest: PluginManifest): string | undefined {
  const seen = new Set<string>();
  for (const { path } of manifest.data ?? []) {
    const problem = dataPathProblem(path);
    if (problem) {
      return `data: \`${path}\` ${problem}`;
    }
    if (seen.has(path)) {
      return `data: \`${path}\` is named twice`;
    }
    seen.add(path);
  }
  return undefined;
}

/**
 * A data file is a path inside the deck, `/`-separated, through no hidden folder, and none of the
 * files and folders dek reads or writes there.
 */
function dataPathProblem(path: string): string | undefined {
  if (path === "" || path.startsWith("/") || path.includes("\\")) {
    return "is not a path relative to the deck";
  }
  const segments = path.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    return "is not a path inside the deck";
  }
  if (segments.some((segment) => segment.startsWith("."))) {
    return "is hidden, and dek reads no hidden file of a deck";
  }
  // A Mac's disk and Windows' take `Slides` for `slides`.
  if (DEK_DECK_ENTRIES.has((segments[0] ?? "").normalize("NFC").toLowerCase())) {
    return "is dek's";
  }
  return undefined;
}

/** The manifest with its keys in one order, so the same promise is always the same lock. */
function canonical(manifest: PluginManifest): PluginManifest {
  const rules = manifest.check?.rules;
  return {
    schema: manifest.schema,
    name: manifest.name,
    version: manifest.version,
    ...(manifest.check && rules
      ? {
          check: {
            protocol: manifest.check.protocol,
            rules: Object.fromEntries(
              Object.keys(rules)
                .sort()
                .map((id) => {
                  const rule = rules[id] as PluginRule;
                  return [id, { severity: rule.severity, summary: rule.summary }];
                }),
            ),
          },
        }
      : {}),
    ...(manifest.page
      ? { page: { api: manifest.page.api, keys: [...(manifest.page.keys ?? [])].sort() } }
      : {}),
    ...(manifest.data ? { data: manifest.data.map(({ path }) => ({ path })) } : {}),
  };
}

/** `plugins/<name>/plugin.json`: the manifest the project accepted, which is its lock. */
export function lockText(manifest: PluginManifest): string {
  return `${JSON.stringify({ accepted: canonical(manifest) }, null, 2)}\n`;
}

/** The manifest a lock pins, read as `manifest`'s output is, so a newer dek's fields are left out. */
export function readLock(text: string, name: string): ManifestReading {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: "it is not JSON" };
  }
  const accepted =
    typeof parsed === "object" && parsed !== null
      ? (parsed as { accepted?: unknown }).accepted
      : undefined;
  if (accepted === undefined) {
    return { ok: false, reason: "it has no `accepted` manifest" };
  }
  return readManifest(accepted, name);
}

/**
 * What changed from the manifest the project accepted to the one installed, one line per change
 * in dek's words: the version, each rule added, removed, or changed, and each data file.
 */
export function manifestChanges(accepted: PluginManifest, installed: PluginManifest): string[] {
  const changes: string[] = [];
  if (accepted.version !== installed.version) {
    changes.push(`version ${accepted.version} → ${installed.version}`);
  }
  changes.push(...checkChanges(accepted.check, installed.check));
  changes.push(...pageChanges(accepted.page, installed.page));
  const before = new Set((accepted.data ?? []).map(({ path }) => path));
  const after = new Set((installed.data ?? []).map(({ path }) => path));
  for (const path of before) {
    if (!after.has(path)) {
      changes.push(`data ${path} removed`);
    }
  }
  for (const path of after) {
    if (!before.has(path)) {
      changes.push(`data ${path} added`);
    }
  }
  return changes;
}

function pageChanges(
  accepted: PluginManifest["page"],
  installed: PluginManifest["page"],
): string[] {
  const keys = (page: PluginManifest["page"]) => (page?.keys ?? []).join(", ") || "none";
  if (!accepted && !installed) {
    return [];
  }
  if (!installed) {
    return ["page removed"];
  }
  if (!accepted) {
    return [`page added (keys ${keys(installed)})`];
  }
  return keys(accepted) === keys(installed)
    ? []
    : [`page keys ${keys(accepted)} → ${keys(installed)}`];
}

function checkChanges(
  accepted: PluginManifest["check"],
  installed: PluginManifest["check"],
): string[] {
  if (!accepted && !installed) {
    return [];
  }
  if (!installed) {
    return ["check removed"];
  }
  if (!accepted) {
    const rules = Object.entries(installed.rules)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, rule]) => `${id} (${rule.severity})`);
    return [`check added: ${rules.join(", ")}`];
  }
  const changes: string[] = [];
  const ids = [
    ...new Set([...Object.keys(accepted.rules), ...Object.keys(installed.rules)]),
  ].sort();
  for (const id of ids) {
    const before = accepted.rules[id];
    const after = installed.rules[id];
    if (!after) {
      changes.push(`${id} removed`);
    } else if (!before) {
      changes.push(`${id} added (${after.severity})`);
    } else if (before.severity !== after.severity) {
      changes.push(`${id} ${before.severity} → ${after.severity}`);
    } else if (before.summary !== after.summary) {
      changes.push(`${id} summary changed`);
    }
  }
  return changes;
}

/** A plugin dek.toml names, with the manifest its lock pins when it has one. */
export type PinnedPlugin = { name: string; manifest: PluginManifest | undefined };

/**
 * The plugins in AGENTS.md: one line each, made from the lock and never from the executable, so
 * every sync writes the same block, the dev server's included. Each line is dek's words about
 * checked fields; the plugin's own summaries stay out. Empty when dek.toml names no plugin.
 */
export function pluginsSection(plugins: PinnedPlugin[]): string {
  if (plugins.length === 0) {
    return "";
  }
  const lines = plugins.map(({ name, manifest }) => {
    if (!manifest) {
      return `- \`${name}\`: not pinned yet; \`dekc sync\` pins it.`;
    }
    const facts = [
      ...(manifest.check
        ? [`\`dekc lint\` checks ${ruleList(Object.keys(manifest.check.rules))}.`]
        : []),
      ...(manifest.data && manifest.data.length > 0
        ? [`Its data: ${manifest.data.map(({ path }) => `\`${path}\``).join(", ")}.`]
        : []),
      ...(manifest.page?.keys && manifest.page.keys.length > 0
        ? [
            `Its page takes the ${manifest.page.keys.length === 1 ? "key" : "keys"} ${manifest.page.keys.map((key) => `\`${key}\``).join(", ")}.`,
          ]
        : []),
    ];
    return `- \`${name}\` ${manifest.version}${facts.length > 0 ? `: ${facts.join(" ")}` : ""}`;
  });
  return `
## Plugins

Checks installed beside dek, named in \`dek.toml\` \`[plugins]\` and pinned in \`plugins/<name>/plugin.json\`. \`dekc lint\` runs them with dek's own rules; their findings carry the plugin's rule ids.

${lines.join("\n")}
`;
}

function ruleList(ids: string[]): string {
  const sorted = [...ids].sort();
  if (sorted.length === 0) {
    return "no rules";
  }
  if (sorted.length === 1) {
    return sorted[0] as string;
  }
  if (sorted.length === 2) {
    return `${sorted[0]} and ${sorted[1]}`;
  }
  const numbers = sorted.map((id) => Number(id.slice(-3)));
  const contiguous = numbers.every((n, i) => i === 0 || n === (numbers[i - 1] as number) + 1);
  return contiguous ? `${sorted[0]} to ${sorted.at(-1)}` : sorted.join(", ");
}

/**
 * A plugin's page as the player and the build carry it: its script, the keys its manifest
 * declares, and each declared data file the deck has, with a version that changes with the text.
 */
export type PluginPage = {
  name: string;
  keys: string[];
  script: string;
  data: Record<string, { text: string; version: string }>;
};
