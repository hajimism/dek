import { describe, expect, test } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  marksBreaking,
  SCHEMA_PATH,
  schemaBreaks,
  UncomparedKeyword,
} from "../../scripts/schema-breaks.ts";
import { CLI_SCHEMA_PATH } from "../../src/cli/contract.ts";
import { withTempDir } from "../helpers/fs.ts";
import { repoRoot } from "../helpers/paths.ts";

type Schema = Record<string, unknown>;

const string = { type: "string" };
const integer = { type: "integer", minimum: -9007199254740991, maximum: 9007199254740991 };
const ok = (value: boolean) => ({ type: "boolean", const: value });
const action = (value: string) => ({ type: "string", const: value });

function object(properties: Record<string, Schema>, required = Object.keys(properties)): Schema {
  return { type: "object", properties, required, additionalProperties: false };
}

const thrown = object({ ok: ok(false), error: { $ref: "#/$defs/Error" } });

/** A command's envelope, as src/cli/contract.ts writes one: each form with `ok`, then a failure. */
function command(...forms: Schema[]): Schema {
  return { anyOf: [...forms, thrown] };
}

/** A form of a result: its fields beside `ok: true`. */
function result(fields: Record<string, Schema>, required = Object.keys(fields)): Schema {
  return object({ ...fields, ok: ok(true) }, [...required, "ok"]);
}

function doc(defs: Record<string, Schema>): { $defs: Record<string, Schema> } {
  return { $defs: { ...defs, Error: object({ message: string, hint: string }, ["message"]) } };
}

/** A `lint` result with one field, `field`, as given. */
function field(schema: Schema): { $defs: Record<string, Schema> } {
  return doc({ lint: command(result({ field: schema })) });
}

/** Each change as `<path> <message>`, the way the script prints it. */
function changes(base: object, head: object): string[] {
  return schemaBreaks(base, head).map((change) => `${change.path} ${change.message}`);
}

/** A schema read from the committed file, typed as far as the tests below reach into it. */
type Shape = { properties: Record<string, Schema>; anyOf: Shape[] };

const committed = async () =>
  JSON.parse(await readFile(join(repoRoot, CLI_SCHEMA_PATH), "utf8")) as {
    $defs: Record<string, Shape>;
  };

describe("what narrows --json", () => {
  test("reads the file bun run schema writes", () => {
    expect(SCHEMA_PATH).toBe(CLI_SCHEMA_PATH);
  });

  test("finds nothing between the committed schema and itself", async () => {
    expect(changes(await committed(), await committed())).toEqual([]);
  });

  test("lets through a new property, required or not, and a new command", () => {
    const base = doc({ lint: command(result({ outs: string })) });
    const head = doc({
      lint: command(result({ outs: string, count: integer, note: string }, ["outs", "count"])),
      pptx: command(result({ outs: string })),
    });
    expect(changes(base, head)).toEqual([]);
  });

  test("reports a removed property, optional or not, and a property no longer required", () => {
    const base = doc({ check: command(result({ slug: string, shot: string, fill: integer })) });
    const head = doc({ check: command(result({ shot: string }, [])) });
    expect(changes(base, head)).toEqual([
      "/$defs/check/anyOf/0/properties/slug removed",
      "/$defs/check/anyOf/0/properties/shot no longer required",
      "/$defs/check/anyOf/0/properties/fill removed",
    ]);
  });

  test("reports a removed command", () => {
    const base = doc({ lint: command(result({})), video: command(result({ out: string })) });
    expect(changes(base, doc({ lint: command(result({})) }))).toEqual([
      "/$defs/video removed, with every line it describes",
    ]);
  });

  test("reports a type that takes more, and lets one that takes less through", () => {
    const at = (fields: Record<string, Schema>) => doc({ show: command(result(fields)) });
    const base = at({ html: string, line: integer, seconds: { type: "number" } });
    const wider = at({
      html: { type: ["string", "null"] },
      line: { type: "number" },
      seconds: { type: "number" },
    });
    expect(changes(base, wider)).toEqual([
      "/$defs/show/anyOf/0/properties/html can now also be null",
      "/$defs/show/anyOf/0/properties/line was integer, can now be number",
    ]);
    const narrower = at({ html: string, line: integer, seconds: integer });
    expect(changes(wider, narrower)).toEqual([]);
  });

  test("reports a named value added or removed, and a constant changed", () => {
    const severity = (values: string[]) => ({ type: "string", enum: values });
    const at = (values: string[], end: Schema) =>
      doc({ lint: command(result({ severity: severity(values), end }, ["severity"])) });
    expect(changes(at(["error", "warning"], ok(true)), at(["error", "info"], ok(false)))).toEqual([
      '/$defs/lint/anyOf/0/properties/severity no longer "warning"',
      '/$defs/lint/anyOf/0/properties/severity can now be "info"',
      "/$defs/lint/anyOf/0/properties/end was true, is now false",
    ]);
  });

  test("reports a bound loosened, and lets one tightened through", () => {
    const at = (minimum: number) =>
      doc({ marks: command(result({ cleared: { type: "integer", minimum } })) });
    expect(changes(at(0), at(-1))).toEqual([
      "/$defs/marks/anyOf/0/properties/cleared minimum was 0, is now -1",
    ]);
    expect(changes(at(-1), at(0))).toEqual([]);
  });

  test("reports an upper bound raised or gone", () => {
    const base = field({ type: "string", maxLength: 10 });
    expect(changes(base, field({ type: "string", maxLength: 20 }))).toEqual([
      "/$defs/lint/anyOf/0/properties/field maxLength was 10, is now 20",
    ]);
    expect(changes(base, field(string))).toEqual([
      "/$defs/lint/anyOf/0/properties/field maxLength 10 is gone",
    ]);
  });

  test("reports a pattern or a format changed or dropped, and lets one added through", () => {
    const base = field({ type: "string", pattern: "^DEK", format: "date" });
    expect(changes(base, field({ type: "string", pattern: "^[A-Z]" }))).toEqual([
      '/$defs/lint/anyOf/0/properties/field pattern was "^DEK", is now "^[A-Z]"',
      '/$defs/lint/anyOf/0/properties/field format was "date", is now undefined',
    ]);
    expect(changes(field(string), base)).toEqual([]);
  });

  test("reports a head that no longer states a type, a value, items, or entries", () => {
    expect(changes(field(string), field({}))).toEqual([
      "/$defs/lint/anyOf/0/properties/field takes any type, not only string",
    ]);
    expect(changes(field({ type: "string", enum: ["a", "b"] }), field(string))).toEqual([
      '/$defs/lint/anyOf/0/properties/field takes any value, not only "a" or "b"',
    ]);
    expect(changes(field({ type: "array", items: string }), field({ type: "array" }))).toEqual([
      "/$defs/lint/anyOf/0/properties/field/items items take any value now",
    ]);
    const record = (entries: unknown) => field({ type: "object", additionalProperties: entries });
    expect(changes(record(string), record(true))).toEqual([
      "/$defs/lint/anyOf/0/properties/field/additionalProperties entries take any value now",
    ]);
    expect(changes(record(string), record(false))).toEqual([
      "/$defs/lint/anyOf/0/properties/field/additionalProperties takes no entries now",
    ]);
  });

  test("compares the names a record's keys take", () => {
    const record = (names: string[]) =>
      field({
        type: "object",
        propertyNames: { type: "string", enum: names },
        additionalProperties: string,
      });
    expect(changes(record(["a"]), record(["a", "b"]))).toEqual([
      '/$defs/lint/anyOf/0/properties/field/propertyNames can now be "b"',
    ]);
  });

  test("reports a change once where a type list repeats it", () => {
    const at = (pattern: string) => field({ type: ["string", "null"], pattern });
    expect(changes(at("^a"), at("^b"))).toEqual([
      '/$defs/lint/anyOf/0/properties/field pattern was "^a", is now "^b"',
    ]);
  });

  test("reports a form gone, and lets a new subcommand's form through", () => {
    const add = result({ action: action("add"), name: string });
    const rm = result({ action: action("rm"), name: string });
    const mv = result({ action: action("mv"), from: string });
    expect(changes(doc({ ref: command(add, rm) }), doc({ ref: command(add, mv) }))).toEqual([
      '/$defs/ref/anyOf/1 the form where action is "rm" and ok is true is gone',
    ]);
  });

  test("reports a new form with an action an old form has, which no new subcommand prints", () => {
    const add = result({ action: action("add"), name: string });
    const other = result({ action: action("add"), url: string });
    expect(changes(doc({ ref: command(add) }), doc({ ref: command(add, other) }))).toEqual([
      '/$defs/ref/anyOf/1 a new form where action is "add" and ok is true, which reads as none of the old ones',
    ]);
  });

  test("reports a new form a consumer of the old ones cannot read", () => {
    const project = result({ root: string, decks: string });
    const deck = result({ name: string, title: string });
    const base = doc({ ls: command(project, deck) });
    expect(changes(base, doc({ ls: command(project, deck, result({ refs: string })) }))).toEqual([
      "/$defs/ls/anyOf/2 a new form where ok is true, which reads as none of the old ones",
    ]);
  });

  test("tells a command's forms apart, and lets through a failure that reads as one", () => {
    const fields = { outs: string };
    const failing = object({ ...fields, ok: ok(false), error: { $ref: "#/$defs/Error" } });
    const base = doc({ build: command(result(fields)) });
    expect(changes(base, doc({ build: command(result(fields), failing) }))).toEqual([]);
    // The two forms that fail differ in what they hold, and each is kept by its own.
    const lint = doc({ lint: command(result(fields), failing) });
    expect(changes(lint, lint)).toEqual([]);
    const lost = object({ ok: ok(false), error: { $ref: "#/$defs/Error" } });
    expect(changes(lint, doc({ lint: command(result(fields), lost) }))).toEqual([
      "/$defs/lint/anyOf/1/properties/outs removed",
    ]);
  });

  test("keeps a form's widening when a failure with fewer fields reads as the same form", () => {
    const error = { $ref: "#/$defs/Error" };
    const at = (failingSlug: Schema, thrown = true) =>
      doc({
        check: {
          anyOf: [
            object({ slug: string, ok: ok(true) }),
            object({ slug: failingSlug, ok: ok(false), error }),
            ...(thrown ? [object({ ok: ok(false), error })] : []),
          ],
        },
      });
    const nullable = { type: ["string", "null"] };
    expect(changes(at(string), at(nullable))).toEqual([
      "/$defs/check/anyOf/1/properties/slug can now also be null",
    ]);
    // With the thrown failure gone, both ok:false forms become the fuller one, the thrown one
    // without a change; the fuller one's widening still counts.
    expect(changes(at(string), at(nullable, false))).toEqual([
      "/$defs/check/anyOf/1/properties/slug can now also be null",
    ]);
  });

  test("reports a change to a shared shape once, where it is defined", async () => {
    const base = await committed();
    const head = structuredClone(base);
    const diagnostic = head.$defs.Diagnostic;
    if (diagnostic === undefined) {
      throw new Error("the schema has no Diagnostic");
    }
    diagnostic.properties.severity = { type: "string", enum: ["error", "warning", "info"] };
    expect(changes(base, head)).toEqual([
      '/$defs/Diagnostic/properties/severity can now be "info"',
    ]);
  });

  test("reads a property gone from the committed schema", async () => {
    const base = await committed();
    const head = structuredClone(base);
    const form = head.$defs.check?.anyOf[0];
    if (form === undefined) {
      throw new Error("the schema has no check");
    }
    delete form.properties.fill;
    expect(changes(base, head)).toEqual(["/$defs/check/anyOf/0/properties/fill removed"]);
  });

  test("follows a recursive shape under a new name without looping", () => {
    const value = (name: string): Schema => ({
      anyOf: [string, { type: "array", items: { $ref: `#/$defs/${name}` } }],
    });
    const at = (name: string, shape: Schema) =>
      doc({
        lint: command(result({ data: { $ref: `#/$defs/${name}` } })),
        [name]: shape,
      });
    expect(changes(at("Value", value("Value")), at("Datum", value("Datum")))).toEqual([]);
    const nullable = { anyOf: [...(value("Datum").anyOf as Schema[]), { type: "null" }] };
    expect(changes(at("Value", value("Value")), at("Datum", nullable))).toEqual([
      "/$defs/lint/anyOf/0/properties/data/anyOf/2 can now also be null",
    ]);
  });

  test("fails on a keyword it does not compare, rather than passing it unread", () => {
    expect(() => changes(field(string), field({ allOf: [string] }))).toThrow(
      "/$defs/lint/anyOf/0/properties/field: the schema uses allOf",
    );
  });

  test("fails the change that first writes such a keyword, in a new command too", () => {
    // What z.tuple writes: the pull request that adds it fails, not the next one to compare it.
    const size = { type: "array", prefixItems: [integer, integer] };
    const head = doc({ lint: command(result({})), grid: command(result({ size })) });
    expect(() => schemaBreaks(doc({ lint: command(result({})) }), head)).toThrow(
      new UncomparedKeyword("prefixItems", "/$defs/grid/anyOf/0/properties/size"),
    );
  });
});

describe("a commit marked breaking", () => {
  test.each([
    "feat!: drop fill",
    "feat(check)!: drop fill",
    "fix: drop fill\n\nBREAKING CHANGE: read coverage instead",
    "refactor: drop fill\n\nWhy.\n\nBREAKING-CHANGE: read coverage instead",
  ])("is %p", (message) => {
    expect(marksBreaking(message)).toBe(true);
  });

  test.each([
    "feat: drop fill",
    "feat(check): drop fill!",
    "feat: drop fill\n\nNo BREAKING CHANGE: here, mid-line",
    "BREAKING CHANGE: in the subject",
  ])("is not %p", (message) => {
    expect(marksBreaking(message)).toBe(false);
  });
});

describe("bun scripts/schema-compat.ts", () => {
  const script = join(repoRoot, "scripts", "schema-compat.ts");
  const base = doc({ check: command(result({ slug: string, fill: integer })) });
  const narrowed = doc({ check: command(result({ slug: string })) });

  function git(dir: string, ...args: string[]): void {
    const run = Bun.spawnSync(
      [
        "git",
        ...["-c", "user.name=dek", "-c", "user.email=dek@example.com"],
        ...["-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null"],
        ...args,
      ],
      { cwd: dir, stdout: "pipe", stderr: "pipe" },
    );
    if (run.exitCode !== 0) {
      throw new Error(run.stderr.toString());
    }
  }

  async function commitSchema(dir: string, schema: object, message: string): Promise<void> {
    await writeFile(join(dir, SCHEMA_PATH), JSON.stringify(schema));
    git(dir, "add", ".");
    git(dir, "commit", "-q", "-m", message);
  }

  /** The script run in `dir`, outside Actions unless `actions` says what Actions would set. */
  async function compat(dir: string, args: string[], actions: Record<string, string> = {}) {
    const { GITHUB_ACTIONS: _, GITHUB_EVENT_NAME: __, ...env } = process.env;
    const proc = Bun.spawn([process.execPath, script, ...args], {
      cwd: dir,
      env: { ...env, ...actions },
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    return { exitCode, out: stdout + stderr };
  }

  async function withRepo(fn: (dir: string) => Promise<void>): Promise<void> {
    await withTempDir(async (dir) => {
      git(dir, "init", "-q", "-b", "main");
      await mkdir(join(dir, "docs", "public"), { recursive: true });
      await commitSchema(dir, base, "feat: start");
      git(dir, "switch", "-q", "-c", "topic");
      await fn(dir);
    });
  }

  test("fails a narrowing no commit marks, naming where it narrows and what to do", async () => {
    await withRepo(async (dir) => {
      await commitSchema(dir, narrowed, "feat(check): measure less");
      const { exitCode, out } = await compat(dir, ["main"]);
      expect(exitCode).toBe(1);
      expect(out).toContain("/$defs/check/anyOf/0/properties/fill  removed");
      expect(out).toContain("error: no commit since");
      expect(out).toContain('hint: put "!" after the type of the commit');
    });
  });

  test("passes a narrowing a commit marks breaking", async () => {
    await withRepo(async (dir) => {
      await commitSchema(dir, narrowed, "feat(check)!: measure less");
      git(dir, "commit", "-q", "--allow-empty", "-m", "docs: say so");
      const { exitCode, out } = await compat(dir, ["main", "HEAD"]);
      expect(exitCode).toBe(0);
      expect(out).toContain("Marked breaking by");
      expect(out).toContain("feat(check)!: measure less");
    });
  });

  test("reads the working tree before anything is committed", async () => {
    await withRepo(async (dir) => {
      await writeFile(join(dir, SCHEMA_PATH), JSON.stringify(narrowed));
      expect((await compat(dir, ["main"])).exitCode).toBe(1);
      await writeFile(join(dir, SCHEMA_PATH), JSON.stringify(base));
      const { exitCode, out } = await compat(dir, ["main"]);
      expect(exitCode).toBe(0);
      expect(out).toContain("--json keeps everything it promised");
    });
  });

  test("warns in Actions that a squash merge must carry the mark", async () => {
    await withRepo(async (dir) => {
      await commitSchema(dir, narrowed, "feat(check)!: measure less");
      const { exitCode, out } = await compat(dir, ["main"], { GITHUB_ACTIONS: "true" });
      expect(exitCode).toBe(0);
      expect(out).toContain("::warning title=Keep the breaking mark when squashing::");
    });
  });

  test("fails on main a squash commit that has the mark only in a line of its body", async () => {
    await withRepo(async (dir) => {
      git(dir, "switch", "-q", "main");
      await commitSchema(
        dir,
        narrowed,
        "feat(check): measure less (#1)\n\n* feat(check)!: measure less",
      );
      const { exitCode, out } = await compat(dir, ["HEAD~1", "HEAD"], {
        GITHUB_EVENT_NAME: "push",
      });
      expect(exitCode).toBe(1);
      expect(out).toContain("hint: merge a commit marked breaking");
    });
  });

  test("stops on a keyword it does not compare, naming what to teach it", async () => {
    await withRepo(async (dir) => {
      const size = { type: "array", prefixItems: [integer, integer] };
      await writeFile(
        join(dir, SCHEMA_PATH),
        JSON.stringify({ $defs: { ...base.$defs, grid: command(result({ size })) } }),
      );
      const { exitCode, out } = await compat(dir, ["main"]);
      expect(exitCode).toBe(2);
      expect(out).toContain("hint: teach scripts/schema-breaks.ts what prefixItems means");
    });
  });

  test("stops on a schema that is not JSON, naming the command that writes it", async () => {
    await withRepo(async (dir) => {
      await writeFile(join(dir, SCHEMA_PATH), "{");
      const { exitCode, out } = await compat(dir, ["main"]);
      expect(exitCode).toBe(2);
      expect(out).toContain("in the working tree is not JSON");
      expect(out).toContain("hint: write it again with `bun run schema`");
    });
  });
});
