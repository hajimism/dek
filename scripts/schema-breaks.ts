/**
 * What a change to the `--json` contract takes from a consumer, read from the JSON Schema that
 * `bun run schema` writes, as it was at two commits. scripts/schema-compat.ts runs it on every
 * pull request and every push to main; ADR 31 says which changes count and why.
 *
 * A consumer, as this reads one, picks a command's schema by name, reads the properties it knows
 * and ignores the rest, tells a result's forms apart by their constants (`ok`, `action`), and acts
 * on the values an enum or a constant names. A change breaks it when the head takes away what the
 * base promised (a command, a form, a property, a required property's presence, a named value) or
 * lets through what the base ruled out (another type, another named value, a looser bound).
 */

/** The file `bun run schema` writes; a test holds it to CLI_SCHEMA_PATH in src/cli/contract.ts. */
export const SCHEMA_PATH = "docs/public/cli.schema.json";

export type Break = {
  /** A JSON Pointer into the base's schema; into the head's for a form only the head has. */
  path: string;
  /** Whether the head takes away what the base promised, or lets through what it ruled out. */
  kind: "lost" | "widened";
  message: string;
};

/**
 * A keyword this does not compare. What it means for a reader is decided, and taught here with a
 * test, before the contract uses it.
 */
export class UncomparedKeyword extends Error {
  constructor(
    readonly keyword: string,
    readonly path: string,
  ) {
    super(`${path}: the schema uses ${keyword}, which scripts/schema-breaks.ts does not compare`);
  }
}

type Schema = { [keyword: string]: unknown };
type Doc = { $defs?: Record<string, Schema> };

/** One alternative of a union, or the schema itself when it is none. */
type Branch = { raw: Schema; node: Schema; path: string; doc: Doc };

const LOWER_BOUNDS = ["minimum", "exclusiveMinimum", "minLength", "minItems"];
const UPPER_BOUNDS = ["maximum", "exclusiveMaximum", "maxLength", "maxItems"];

/** The keywords compared. Any other fails the comparison rather than passing unread. */
const COMPARED = new Set([
  "$ref",
  "type",
  "const",
  "enum",
  "anyOf",
  "oneOf",
  "properties",
  "required",
  "additionalProperties",
  "propertyNames",
  "items",
  "pattern",
  "format",
  ...LOWER_BOUNDS,
  ...UPPER_BOUNDS,
]);

/** Keywords that say nothing about the value. */
const ANNOTATIONS = new Set([
  "$schema",
  "$id",
  "$comment",
  "title",
  "description",
  "default",
  "examples",
  "deprecated",
  "readOnly",
  "writeOnly",
]);

/**
 * The constant that names the subcommand behind a form (`ref add`, `voice say`): a form with a
 * value of it no old form has is a new subcommand's result, which no existing consumer reads.
 */
const SUBCOMMAND = "action";

/**
 * Every change from `base` to `head` that can break a consumer of `--json`. A command is a `$defs`
 * entry nothing refers to; a shape commands share is compared once, under its own name. Throws
 * UncomparedKeyword when the head uses a keyword this does not compare, anywhere in it.
 */
export function schemaBreaks(base: Doc, head: Doc): Break[] {
  assertComparable(head);
  const comparison = new Comparison(base, head);
  const baseShared = referencedDefs(base);
  const headShared = referencedDefs(head);
  const breaks: Break[] = [];
  for (const [name, schema] of Object.entries(base.$defs ?? {})) {
    const path = pointer("", "$defs", name);
    const next = head.$defs?.[name];
    if (!baseShared.has(name)) {
      if (next === undefined) {
        breaks.push({ path, kind: "lost", message: "removed, with every line it describes" });
      } else {
        breaks.push(...comparison.compare(schema, next, path));
      }
    } else if (next !== undefined && headShared.has(name)) {
      breaks.push(...comparison.compare(schema, next, path));
    }
  }
  // Once each, and those at one path together, in the order the base's schema reaches them.
  const seen = new Set<string>();
  const order = new Map<string, number>();
  return breaks
    .filter((change) => {
      const key = `${change.kind}\0${change.path}\0${change.message}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      order.set(change.path, order.get(change.path) ?? order.size);
      return true;
    })
    .sort((a, b) => (order.get(a.path) ?? 0) - (order.get(b.path) ?? 0));
}

/** Whether a commit message marks its change breaking, as release-please reads it. */
export function marksBreaking(message: string): boolean {
  const [subject = "", ...body] = message.split("\n");
  return (
    /^[a-z]+(\([^()\n]+\))?!: /i.test(subject) || /^BREAKING[ -]CHANGE: /m.test(body.join("\n"))
  );
}

class Comparison {
  /** The pairs of `$ref`s being compared, so a recursive shape is walked once. */
  private readonly active = new Set<string>();

  constructor(
    private readonly base: Doc,
    private readonly head: Doc,
  ) {}

  compare(base: Schema, head: Schema, path: string): Break[] {
    const baseRef = typeof base.$ref === "string" ? base.$ref : undefined;
    const headRef = typeof head.$ref === "string" ? head.$ref : undefined;
    if (baseRef !== undefined && baseRef === headRef) {
      return [];
    }
    const pair = baseRef !== undefined && headRef !== undefined ? `${baseRef}\0${headRef}` : "";
    if (pair !== "" && this.active.has(pair)) {
      return [];
    }
    if (pair !== "") {
      this.active.add(pair);
    }
    try {
      const bases = branches(this.base, base, path);
      const heads = branches(this.head, head, path);
      const [onlyBase] = bases;
      const [onlyHead] = heads;
      return bases.length === 1 && heads.length === 1 && onlyBase && onlyHead
        ? this.compareNode(onlyBase.node, onlyHead.node, path)
        : this.compareUnion(bases, heads);
    } finally {
      this.active.delete(pair);
    }
  }

  private compareNode(base: Schema, head: Schema, path: string): Break[] {
    const breaks: Break[] = [];
    const lost = (at: string, message: string) => breaks.push({ path: at, kind: "lost", message });
    const widened = (at: string, message: string) =>
      breaks.push({ path: at, kind: "widened", message });

    const baseTypes = typesOf(base);
    const headTypes = typesOf(head);
    if (baseTypes !== undefined) {
      if (headTypes === undefined) {
        widened(path, `takes any type, not only ${list(baseTypes)}`);
      } else if ([...headTypes].some((type) => !covers(baseTypes, type))) {
        widened(path, `was ${list(baseTypes)}, can now be ${list(headTypes)}`);
      }
    }

    const baseValues = valuesOf(base);
    const headValues = valuesOf(head);
    if (baseValues !== undefined) {
      if (headValues === undefined) {
        widened(path, `takes any value, not only ${list(baseValues.map(json))}`);
      } else if (baseValues.length === 1 && headValues.length === 1) {
        if (!same(baseValues[0], headValues[0])) {
          lost(path, `was ${json(baseValues[0])}, is now ${json(headValues[0])}`);
        }
      } else {
        for (const value of baseValues.filter((v) => !headValues.some((w) => same(v, w)))) {
          lost(path, `no longer ${json(value)}`);
        }
        for (const value of headValues.filter((v) => !baseValues.some((w) => same(v, w)))) {
          widened(path, `can now be ${json(value)}`);
        }
      }
    }

    for (const keyword of LOWER_BOUNDS) {
      loosened(base[keyword], head[keyword], (was, now) => now < was, keyword, path, widened);
    }
    for (const keyword of UPPER_BOUNDS) {
      loosened(base[keyword], head[keyword], (was, now) => now > was, keyword, path, widened);
    }
    for (const keyword of ["pattern", "format"]) {
      if (base[keyword] !== undefined && base[keyword] !== head[keyword]) {
        widened(path, `${keyword} was ${json(base[keyword])}, is now ${json(head[keyword])}`);
      }
    }

    // Read as an object only while the head can still be one; otherwise the type said it all.
    if (headTypes === undefined || headTypes.has("object")) {
      const baseProperties = schemaMap(base.properties);
      const headProperties = schemaMap(head.properties) ?? {};
      const baseRequired = requiredOf(base);
      const headRequired = requiredOf(head);
      for (const [name, schema] of Object.entries(baseProperties ?? {})) {
        const at = pointer(path, "properties", name);
        const next = headProperties[name];
        if (next === undefined) {
          lost(at, "removed");
          continue;
        }
        if (baseRequired.has(name) && !headRequired.has(name)) {
          lost(at, "no longer required");
        }
        breaks.push(...this.compare(schema, next, at));
      }
      const baseEntries = base.additionalProperties;
      const headEntries = head.additionalProperties;
      if (isSchema(baseEntries)) {
        const at = pointer(path, "additionalProperties");
        if (headEntries === false) {
          lost(at, "takes no entries now");
        } else if (!isSchema(headEntries)) {
          widened(at, "entries take any value now");
        } else {
          breaks.push(...this.compare(baseEntries, headEntries, at));
        }
      }
      if (isSchema(base.propertyNames) && isSchema(head.propertyNames)) {
        breaks.push(
          ...this.compare(base.propertyNames, head.propertyNames, pointer(path, "propertyNames")),
        );
      }
    }

    if (isSchema(base.items) && (headTypes === undefined || headTypes.has("array"))) {
      const at = pointer(path, "items");
      if (isSchema(head.items)) {
        breaks.push(...this.compare(base.items, head.items, at));
      } else {
        widened(at, "items take any value now");
      }
    }
    return breaks;
  }

  /**
   * A union, such as a command's forms or a value's types. Each form the base has must become one
   * the head has, which keeps what it promised and lets through nothing it ruled out. A form the
   * head adds must read as an old one, or be a new subcommand's. A type the head no longer takes
   * narrows what a consumer reads, and breaks none.
   */
  private compareUnion(bases: Branch[], heads: Branch[]): Break[] {
    const breaks: Break[] = [];
    // Every base form a head form became, by what changed: each is a reader the head form meets.
    const became = new Map<Branch, Break[][]>();
    for (const base of bases) {
      const candidates = heads.filter((head) => pairs(base, head));
      if (candidates.length === 0) {
        if (constantsOf(base).size > 0) {
          const message = `the form where ${described(base)} is gone`;
          breaks.push({ path: base.path, kind: "lost", message });
        }
        continue;
      }
      // What the form became: the candidate that differs from it least, and of two that differ
      // as little, the one with its properties.
      const [head, changes] = candidates
        .map((head): [Branch, Break[]] => [head, this.compare(base.raw, head.raw, base.path)])
        .reduce((best, next) => {
          const fewer = next[1].length - best[1].length;
          return fewer < 0 || (fewer === 0 && sameNames(base, next[0]) && !sameNames(base, best[0]))
            ? next
            : best;
        });
      breaks.push(...changes.filter((change) => change.kind === "lost"));
      became.set(head, [...(became.get(head) ?? []), changes]);
    }
    for (const head of heads) {
      const readers = became.get(head);
      if (readers !== undefined) {
        for (const changes of readers) {
          breaks.push(...changes.filter((change) => change.kind === "widened"));
        }
        continue;
      }
      const readable = bases.some(
        (base) => pairs(base, head) && this.compare(base.raw, head.raw, base.path).length === 0,
      );
      if (!readable && !isNewSubcommand(head, bases)) {
        const message =
          constantsOf(head).size > 0
            ? `a new form where ${described(head)}, which reads as none of the old ones`
            : `can now also be ${list(typesOf(head.node) ?? ["any type"])}`;
        breaks.push({ path: head.path, kind: "widened", message });
      }
    }
    return breaks;
  }
}

/** `schema`'s alternatives, each resolved: a union's options, or one per type of a type list. */
function branches(doc: Doc, raw: Schema, path: string): Branch[] {
  const node = resolve(doc, raw, path);
  for (const keyword of ["anyOf", "oneOf"]) {
    const options = node[keyword];
    if (Array.isArray(options)) {
      return options.flatMap((option: Schema, i) =>
        branches(doc, option, pointer(path, keyword, String(i))),
      );
    }
  }
  if (Array.isArray(node.type) && node.type.length > 1) {
    return node.type.map((type) => {
      const one = { ...node, type };
      return { raw: one, node: one, path, doc };
    });
  }
  return [{ raw, node, path, doc }];
}

/** `schema` with its `$ref`s followed into `doc`'s `$defs`, and every keyword one this knows. */
function resolve(doc: Doc, schema: Schema, path: string): Schema {
  let node = schema;
  const seen = new Set<string>();
  while (typeof node.$ref === "string") {
    const ref = node.$ref;
    const name = /^#\/\$defs\/(.+)$/.exec(ref)?.[1];
    const target = name === undefined ? undefined : doc.$defs?.[decodeToken(name)];
    if (target === undefined) {
      throw new Error(`${path}: ${ref} names nothing under $defs`);
    }
    if (seen.has(ref)) {
      throw new Error(`${path}: ${ref} refers to itself and nothing else`);
    }
    seen.add(ref);
    const { $ref: _, ...rest } = node;
    node = { ...target, ...rest };
  }
  assertKnown(node, path);
  return node;
}

function assertKnown(schema: Schema, path: string): void {
  for (const keyword of Object.keys(schema)) {
    if (!COMPARED.has(keyword) && !ANNOTATIONS.has(keyword)) {
      throw new UncomparedKeyword(keyword, path);
    }
  }
}

/**
 * Every schema under `doc`'s `$defs`, new commands and properties included, uses only keywords
 * this compares. So the pull request that first writes another fails, rather than the next one
 * that compares the shape it is in.
 */
function assertComparable(doc: Doc): void {
  const walk = (schema: unknown, path: string): void => {
    if (!isSchema(schema)) {
      return;
    }
    assertKnown(schema, path);
    for (const [name, child] of Object.entries(schemaMap(schema.properties) ?? {})) {
      walk(child, pointer(path, "properties", name));
    }
    for (const keyword of ["anyOf", "oneOf"]) {
      const options = schema[keyword];
      if (Array.isArray(options)) {
        options.forEach((option, i) => walk(option, pointer(path, keyword, String(i))));
      }
    }
    for (const keyword of ["items", "additionalProperties", "propertyNames"]) {
      walk(schema[keyword], pointer(path, keyword));
    }
  };
  for (const [name, schema] of Object.entries(doc.$defs ?? {})) {
    walk(schema, pointer("", "$defs", name));
  }
}

/** Whether `head` can stand for `base`: the same constants, or a type in common. */
function pairs(base: Branch, head: Branch): boolean {
  const constants = constantsOf(base);
  if (constants.size > 0) {
    const theirs = constantsOf(head);
    return [...constants].every(
      ([name, value]) => theirs.has(name) && same(theirs.get(name), value),
    );
  }
  const baseTypes = typesOf(base.node);
  const headTypes = typesOf(head.node);
  return (
    baseTypes === undefined ||
    headTypes === undefined ||
    [...headTypes].some((type) => covers(baseTypes, type)) ||
    [...baseTypes].some((type) => covers(headTypes, type))
  );
}

function isNewSubcommand(head: Branch, bases: Branch[]): boolean {
  const action = constantsOf(head).get(SUBCOMMAND);
  return (
    action !== undefined && !bases.some((base) => same(constantsOf(base).get(SUBCOMMAND), action))
  );
}

/** The required properties a form holds to one value, such as `ok` and `action`. */
function constantsOf(branch: Branch): Map<string, unknown> {
  const constants = new Map<string, unknown>();
  const required = requiredOf(branch.node);
  for (const [name, schema] of Object.entries(schemaMap(branch.node.properties) ?? {})) {
    const node = resolve(branch.doc, schema, pointer(branch.path, "properties", name));
    if (required.has(name) && "const" in node) {
      constants.set(name, node.const);
    }
  }
  return constants;
}

function sameNames(base: Branch, head: Branch): boolean {
  const names = (branch: Branch) =>
    Object.keys(schemaMap(branch.node.properties) ?? {})
      .sort()
      .join("\0");
  return names(base) === names(head);
}

function described(branch: Branch): string {
  return [...constantsOf(branch)].map(([name, value]) => `${name} is ${json(value)}`).join(" and ");
}

/** The JSON types `schema` takes, or undefined for any. */
function typesOf(schema: Schema): Set<string> | undefined {
  if (typeof schema.type === "string") {
    return new Set([schema.type]);
  }
  if (Array.isArray(schema.type)) {
    return new Set(schema.type.map(String));
  }
  const values = valuesOf(schema);
  return values === undefined ? undefined : new Set(values.map(jsonType));
}

/** The values a `const` or an `enum` names, or undefined when it names none. */
function valuesOf(schema: Schema): unknown[] | undefined {
  if ("const" in schema) {
    return [schema.const];
  }
  return Array.isArray(schema.enum) ? schema.enum : undefined;
}

/** An integer is a number, so `number` takes what `integer` does. */
function covers(types: Set<string>, type: string): boolean {
  return types.has(type) || (type === "integer" && types.has("number"));
}

function jsonType(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  if (typeof value === "number") {
    return Number.isInteger(value) ? "integer" : "number";
  }
  return typeof value;
}

function loosened(
  was: unknown,
  now: unknown,
  looser: (was: number, now: number) => boolean,
  keyword: string,
  path: string,
  widened: (at: string, message: string) => void,
): void {
  if (!isBound(was)) {
    return;
  }
  if (!isBound(now)) {
    widened(path, `${keyword} ${was} is gone`);
  } else if (looser(was, now)) {
    widened(path, `${keyword} was ${was}, is now ${now}`);
  }
}

/**
 * A bound that says something: zod gives every integer the safe range, which a consumer reading
 * a JSON number has anyway.
 */
function isBound(value: unknown): value is number {
  return typeof value === "number" && Math.abs(value) < Number.MAX_SAFE_INTEGER;
}

/** The names of every `$defs` entry a `$ref` anywhere in `doc` points at. */
function referencedDefs(doc: Doc): Set<string> {
  const names = new Set<string>();
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(walk);
    } else if (typeof value === "object" && value !== null) {
      for (const [key, child] of Object.entries(value)) {
        const name = key === "$ref" && typeof child === "string" && /^#\/\$defs\/(.+)$/.exec(child);
        if (name && name[1] !== undefined) {
          names.add(decodeToken(name[1]));
        }
        walk(child);
      }
    }
  };
  walk(doc.$defs);
  return names;
}

function requiredOf(schema: Schema): Set<string> {
  return new Set(Array.isArray(schema.required) ? schema.required.map(String) : []);
}

function isSchema(value: unknown): value is Schema {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function schemaMap(value: unknown): Record<string, Schema> | undefined {
  return isSchema(value) ? (value as Record<string, Schema>) : undefined;
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function json(value: unknown): string {
  return JSON.stringify(value) ?? "undefined";
}

function list(values: Iterable<string>): string {
  return [...values].join(" or ");
}

/** A JSON Pointer: `path` with each of `tokens` escaped and appended. */
function pointer(path: string, ...tokens: string[]): string {
  const escaped = tokens.map((token) => token.replaceAll("~", "~0").replaceAll("/", "~1"));
  return [path, ...escaped].join("/");
}

function decodeToken(token: string): string {
  return token.replaceAll("~1", "/").replaceAll("~0", "~");
}
