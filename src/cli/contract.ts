import { z } from "zod";
import type { DiagnosticValue as DiagnosticValueType } from "../core/diagnostic.ts";
import type { ResultCommand } from "./commands.ts";
import { type CommandLine, parseCommandLine } from "./flags.ts";

/**
 * What `--json` prints, stated once. The commands' own types are checked against it where
 * `COMMANDS` is declared, the tests hold every line a test run prints to it, and the JSON Schema
 * published beside the docs is generated from it, so none of the three can drift from the others.
 * Every object is strict: a field the contract does not name is a change to the contract.
 */

const DiagnosticValue: z.ZodType<DiagnosticValueType> = z
  .lazy(() =>
    z.union([
      z.string(),
      z.number(),
      z.boolean(),
      z.array(DiagnosticValue),
      z.record(z.string(), DiagnosticValue),
    ]),
  )
  .meta({ id: "DiagnosticValue" });

const Diagnostic = z
  .strictObject({
    id: z.string().describe("DEKnnn for dek's own rules; another tool's id for its findings."),
    severity: z.enum(["error", "warning"]).describe("Only an error fails lint and check."),
    message: z.string(),
    path: z.string().optional(),
    line: z.number().int().optional(),
    column: z.number().int().optional().describe("1-based, in UTF-16 units as editors count."),
    slug: z.string().optional().describe("The slide the finding is about."),
    hint: z.string().optional().describe("The fix, phrased as what to do next."),
    data: z
      .record(z.string(), DiagnosticValue)
      .optional()
      .describe("The values the message names, as fields."),
  })
  .meta({ id: "Diagnostic" });

const SkippedCheck = z
  .strictObject({
    check: z.enum(["lint", "preview", "rumdl", "visual", "voice"]),
    reason: z.string(),
    hint: z.string().optional().describe("What to do so that the check runs."),
  })
  .meta({
    id: "SkippedCheck",
    description: "A check that did not run, so an empty list of findings is no pass for it.",
  });

const Failure = z
  .strictObject({
    message: z.string(),
    path: z.string().optional(),
    line: z.number().int().optional(),
    hint: z.string().optional().describe("The next step, whenever dek knows it."),
  })
  .meta({ id: "Error" });

const RefInfo = z
  .strictObject({
    name: z.string(),
    rev: z.string(),
    dir: z.string().describe("The snapshot directory."),
    license: z.string().nullable().describe("The snapshot's license file."),
  })
  .meta({ id: "RefInfo", description: "Set when the deck read is a ref." });

const Position = z
  .strictObject({ slideIndex: z.number().int(), beatIndex: z.number().int() })
  .meta({ id: "Position" });

const paths = z.array(z.string());
const diagnostics = z.array(Diagnostic);
const skipped = z.array(SkippedCheck).optional().describe("Absent when every check ran.");

const nav = z.strictObject({
  slug: z.string(),
  slideIndex: z.number().int(),
  beatIndex: z.number().int(),
  viewers: z
    .number()
    .int()
    .describe("The pages that show the deck; with none, where the next one opened lands."),
});

const shotFile = z.strictObject({
  slug: z.string(),
  step: z.string(),
  path: z.string(),
  to: z.string().optional().describe("A morph frame: the slide the transition goes to."),
  at: z.number().optional().describe("A morph frame: where in the transition, 0..1."),
});

/** The fields each result command prints beside `ok`: one object, or one per form it takes. */
export const RESULT_FIELDS = {
  init: z.strictObject({
    root: z.string(),
    created: paths,
    updated: paths.describe("dek's own files, already there, brought up to date."),
    kept: paths.describe("Files already there that differ from what init would write."),
    next: z.array(z.string()).describe("The commands to run next."),
    playwright: z.string().optional().describe("How to install Playwright, when it is missing."),
    missingTokens: z.array(z.string()).optional(),
  }),
  new: z.strictObject({
    name: z.string(),
    dir: z.string(),
    created: paths,
    updated: paths,
    next: z.array(z.string()),
  }),
  ls: z.union([
    z.strictObject({
      root: z.string(),
      diagnostics: diagnostics.describe("The project's own findings, once."),
      decks: z.array(
        z.strictObject({
          name: z.string(),
          title: z.string(),
          sections: z.number().int(),
          slides: z.number().int(),
          diagnostics,
        }),
      ),
      failed: z.array(z.strictObject({ name: z.string() })),
    }),
    z.strictObject({
      name: z.string(),
      title: z.string(),
      event: z.string().optional(),
      date: z.string().optional(),
      duration: z.string().optional(),
      estimateSeconds: z.number(),
      videoSeconds: z.number().optional(),
      sections: z.array(
        z.strictObject({
          slug: z.string(),
          title: z.string(),
          beats: z.number().int(),
          estimateSeconds: z.number(),
          budgetSeconds: z.number().optional(),
          videoSeconds: z.number().optional(),
        }),
      ),
      diagnostics,
      skipped,
      ref: RefInfo.optional(),
    }),
  ]),
  ref: z.union([
    z.strictObject({
      action: z.literal("add"),
      name: z.string(),
      rev: z.string(),
      from: z.string().optional().describe("The rev it was pinned to before, when this moved it."),
      changed: z.boolean(),
      dir: z.string(),
      license: z.string().nullable(),
      warnings: z.array(z.string()),
    }),
    z.strictObject({
      action: z.literal("list"),
      refs: z.array(
        z.strictObject({
          name: z.string(),
          rev: z.string(),
          fetched: z.boolean(),
          title: z.string().optional(),
          slides: z.number().int().optional(),
        }),
      ),
    }),
    z.strictObject({ action: z.literal("rm"), name: z.string() }),
  ]),
  show: z.strictObject({
    slug: z.string(),
    title: z.string(),
    script: z
      .string()
      .describe("The section as script.md has it, beat headings and their ids included."),
    beats: z
      .array(
        z.strictObject({ id: z.string().optional(), title: z.string(), line: z.number().int() }),
      )
      .describe("The section's beats in order: what a data-step names, by id or by position."),
    html: z.string().nullable(),
    css: z.string().nullable(),
    ts: z.string().nullable(),
    theme: z.string().nullable().describe("The rules of the deck's theme.css this slide uses."),
    assets: paths,
    ref: RefInfo.optional(),
  }),
  theme: z.strictObject({
    path: z.string(),
    classes: z.array(z.string()),
    tokens: z.array(z.strictObject({ name: z.string(), value: z.string() })),
    layouts: z.array(z.strictObject({ name: z.string(), example: z.string().optional() })),
    layout: z.strictObject({ name: z.string(), example: z.string() }).optional(),
    ref: RefInfo.optional(),
  }),
  check: z.strictObject({
    slug: z.string(),
    diagnostics,
    skipped,
    shot: z.string().optional(),
    fill: z
      .strictObject({
        step: z.string().describe("The beat measured: the last, as the slide's shot shows it."),
        coverage: z.number().describe("The share of the frame the content covers."),
        box: z
          .strictObject({
            left: z.number(),
            top: z.number(),
            right: z.number(),
            bottom: z.number(),
          })
          .optional()
          .describe(
            "The smallest box holding it, as shares of the frame. Absent when there is none.",
          ),
        rows: z.array(z.number()).describe("The share of each tenth of the frame, top to bottom."),
        columns: z.array(z.number()).describe("The same, left to right."),
      })
      .optional()
      .describe(
        "How much of the frame the slide fills: each text's lines, each picture's box, and each painted box that holds nothing, as a chart's bar; a card counts by what it holds. Not decoration or ::before and ::after text. Shares from 0 to 1. Absent when the slide was not measured.",
      ),
    voice: z
      .strictObject({
        beats: z.array(
          z.strictObject({
            beatIndex: z.number().int(),
            durationMs: z.number(),
            empty: z.boolean(),
            sentences: z.array(
              z.strictObject({
                text: z.string(),
                kana: z.string(),
                start: z.number(),
                end: z.number(),
              }),
            ),
          }),
        ),
      })
      .optional(),
  }),
  shot: z.strictObject({
    shots: z.array(shotFile),
    sheets: paths.optional().describe("Contact sheets, from --sheet or --motion."),
    motion: z
      .array(
        z.strictObject({
          step: z.string(),
          frames: z.array(
            z.strictObject({ ms: z.number(), path: z.string(), end: z.literal(true).optional() }),
          ),
        }),
      )
      .optional(),
  }),
  mv: z.strictObject({
    from: z.string(),
    to: z.string().optional(),
    before: z.string().optional(),
    after: z.string().optional(),
  }),
  goto: nav,
  current: nav,
  marks: z.union([
    z.strictObject({
      action: z.literal("list"),
      marks: z.array(
        z.strictObject({
          slug: z.string(),
          beat: z
            .string()
            .nullable()
            .describe("The beat's title; null for what the slide says before its first ###."),
          beatIndex: z.number().int().nullable().describe("Null once the beat is gone."),
          line: z.number().int().nullable().describe("The heading's line in script.md."),
          path: z.string(),
          status: z
            .enum(["open", "edited", "gone"])
            .describe("edited once the words differ from what was marked; gone with the beat."),
          was: z.string().describe("The beat's words when it was marked."),
          text: z.string().nullable().describe("The beat's words now."),
          markedAt: z.string(),
        }),
      ),
    }),
    z.strictObject({ action: z.literal("clear"), cleared: z.number().int() }),
  ]),
  sync: z.strictObject({ created: paths, updated: paths, removed: paths, kept: paths }),
  lint: z.strictObject({ diagnostics, skipped }),
  cues: z.strictObject({
    name: z.string(),
    cues: z.array(
      z.strictObject({
        position: Position,
        slug: z.string(),
        line: z.number().int(),
        paragraphs: z.array(z.string()),
      }),
    ),
    diagnostics,
  }),
  voice: z.union([
    z.strictObject({
      action: z.literal("synth"),
      synthesized: z.number().int(),
      cached: z.number().int(),
      timelinePath: z.string(),
      audioPath: z.string(),
    }),
    z.strictObject({
      action: z.literal("speakers"),
      speakers: z.array(z.strictObject({ name: z.string(), styles: z.array(z.string()) })),
    }),
    z.strictObject({ action: z.literal("say"), text: z.string(), path: z.string() }),
    z.strictObject({
      action: z.literal("dict"),
      path: z.string(),
      key: z.string(),
      kana: z.string(),
    }),
    z.strictObject({ action: z.literal("pin"), timelinePath: z.string(), audioPath: z.string() }),
  ]),
  build: z.strictObject({
    outs: paths.describe("One file per deck built."),
    images: paths.describe("dist/<deck>.png for each deck that got a link preview image."),
    diagnostics,
    skipped,
  }),
  video: z.strictObject({
    out: z.string(),
    vtt: z.string().optional(),
    chapters: z.string().optional(),
    credits: z.string().optional(),
  }),
  pdf: z.strictObject({ outs: paths }),
} satisfies Record<ResultCommand, FieldsSchema>;

type FieldsSchema = z.ZodObject | z.ZodUnion<readonly z.ZodObject[]>;

/** What a command prints beside `ok`, by command. */
export type ResultFields = { [K in ResultCommand]: z.input<(typeof RESULT_FIELDS)[K]> };

/** The commands that can do their job and still fail: on an error among their findings. */
export const FAILS_ON_FINDINGS = ["lint", "check"] as const satisfies readonly ResultCommand[];

/** What any command line prints when it cannot run. */
const Thrown = z.strictObject({ ok: z.literal(false), error: Failure });

const withOk = (fields: FieldsSchema, extra: z.ZodRawShape): z.ZodObject[] =>
  (fields instanceof z.ZodUnion ? fields.options : [fields]).map((object) => object.extend(extra));

function resultEnvelope(command: ResultCommand): z.ZodType {
  const fields: FieldsSchema = RESULT_FIELDS[command];
  const fails = (FAILS_ON_FINDINGS as readonly string[]).includes(command);
  return z.union([
    ...withOk(fields, { ok: z.literal(true) }),
    ...(fails ? withOk(fields, { ok: z.literal(false), error: Failure }) : []),
    Thrown,
  ]);
}

const HELP = {
  help: z.union([z.strictObject({ ok: z.literal(true), help: z.string() }), Thrown]),
  version: z.union([z.strictObject({ ok: z.literal(true), version: z.string() }), Thrown]),
};

/** Every line `--json` can print, by what printed it; `failure` is a line that could not run. */
function envelopes(): Record<string, z.ZodType> {
  return {
    ...Object.fromEntries(
      (Object.keys(RESULT_FIELDS) as ResultCommand[]).map((command) => [
        command,
        resultEnvelope(command),
      ]),
    ),
    ...HELP,
    failure: Thrown,
  };
}

/**
 * The schema of what `dek <argv>` prints with `--json`, read from the line as `main` reads it: a
 * result command's envelope, help's or the version's, and for anything else, such as the dev
 * server, which takes no `--json`, only the failure that says so.
 */
export function printedBy(argv: string[]): z.ZodType {
  let line: CommandLine;
  try {
    line = parseCommandLine(argv);
  } catch {
    return Thrown;
  }
  if (line.values.version === true) {
    return HELP.version;
  }
  if (line.command === "help" || line.values.help === true) {
    return HELP.help;
  }
  const command = line.command;
  return command !== undefined && Object.hasOwn(RESULT_FIELDS, command)
    ? resultEnvelope(command as ResultCommand)
    : Thrown;
}

/** Where a printed value breaks `schema`, one line per issue; empty when it keeps it. */
export function contractIssues(schema: z.ZodType, value: unknown): string[] {
  const result = schema.safeParse(value);
  return result.success
    ? []
    : result.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`);
}

/** Where the generated JSON Schema is kept, and the address the docs site serves it at. */
export const CLI_SCHEMA_PATH = "docs/public/cli.schema.json";
export const CLI_SCHEMA_URL = "https://hajimism.github.io/dek/cli.schema.json";

/**
 * The contract as a JSON Schema 2020-12 document: each command's envelope under `$defs`, by name,
 * next to the shapes they share.
 */
export function cliJsonSchema(): object {
  const all = envelopes();
  const generated = z.toJSONSchema(z.strictObject(all)) as {
    properties: Record<string, unknown>;
    $defs?: Record<string, unknown>;
  };
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: CLI_SCHEMA_URL,
    title: "dek --json",
    description:
      "What each dek command prints with --json, one JSON object per line. $defs holds one schema per command, and `failure` for a command line that could not run. While dek is 0.x the shape may change between releases.",
    $defs: { ...generated.properties, ...generated.$defs },
  };
}
