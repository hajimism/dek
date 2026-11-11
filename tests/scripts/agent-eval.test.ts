import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { summarize, writeRecord } from "../../evals/agent/record.ts";
import {
  dekcReport,
  type EvalReport,
  type Invocation,
  leftover,
  markdown,
  type RunReport,
  transcriptReport,
} from "../../evals/agent/report.ts";
import { quote, runScenario } from "../../evals/agent/run.ts";
import { must, openProject, type Scenario } from "../../evals/agent/scenario.ts";
import { scenarios } from "../../evals/agent/scenarios.ts";
import pkg from "../../package.json";
import { playwrightResolved } from "../../src/core/playwright.ts";
import { withTempDir } from "../helpers/fs.ts";
import { repoRoot } from "../helpers/paths.ts";

// The agent eval without a model: an agent that does nothing leaves every scenario failing, and
// one that works each scenario's known solution passes it, so each check means something and the
// runner, its dekc shim, and its report work end to end. Those runs spawn dek dozens of times and
// open a browser, so they run only with AGENT_EVAL_TESTS=1; the report's unit tests always run.

const fakeAgent = `${quote(process.execPath)} ${quote(join(repoRoot, "tests/helpers/fake-agent.ts"))}`;
const noBrowser = !playwrightResolved() || Boolean(process.env.DEK_PLAYWRIGHT);
/** Two runs of a scenario, a browser in each when it needs one, on a machine that may be loaded. */
const SCENARIO_MS = 120_000;
const endToEnd = process.env.AGENT_EVAL_TESTS === "1";
/** Said in the name of each skipped group, so a run without the variable says how to get it. */
const unlessOptedIn = endToEnd ? "" : " (skipped: set AGENT_EVAL_TESTS=1 to run)";

const run = (argv: string[], over: Partial<Invocation> = {}): Invocation => ({
  argv,
  cwd: ".",
  exitCode: 0,
  stdout: "",
  stderr: "",
  ms: 1,
  ...over,
});

describe("dekcReport", () => {
  test("reads errors, diagnostics, skipped checks, and their hints from text", () => {
    const report = dekcReport([
      run(["build", "kenote"], {
        exitCode: 1,
        stderr:
          'error: deck "kenote" not found\n --> decks/kenote\n  help: did you mean `keynote`?\n',
      }),
      run(["lint"], {
        exitCode: 1,
        stdout:
          'script.md:7: DEK001 missing slide HTML for "welcome"\nslides/a.html: DEK036 warning: almost lined up\n  help: line them up\n2 errors: DEK001 ×1\n',
        stderr: "visual: skipped (measured only with --visual)\n  help: run `dekc lint --visual`\n",
      }),
    ]);
    expect(report.seen).toEqual([
      {
        command: "dekc build kenote",
        kind: "error",
        message: 'deck "kenote" not found',
        hint: "did you mean `keynote`?",
      },
      {
        command: "dekc lint",
        kind: "diagnostic",
        id: "DEK001",
        severity: "error",
        message: 'missing slide HTML for "welcome"',
      },
      {
        command: "dekc lint",
        kind: "diagnostic",
        id: "DEK036",
        severity: "warning",
        message: "almost lined up",
        hint: "line them up",
      },
      {
        command: "dekc lint",
        kind: "skipped",
        id: "visual",
        message: "measured only with --visual",
        hint: "run `dekc lint --visual`",
      },
    ]);
    expect(report.unhinted.map((entry) => entry.id)).toEqual(["DEK001"]);
  });

  test("reads the --json envelope when a run printed one", () => {
    const envelope = {
      ok: false,
      error: { message: "lint found 1 error", hint: "fix each error" },
      diagnostics: [{ id: "DEK030", severity: "error", message: "overflows", hint: "cut it" }],
      skipped: [{ check: "voice", reason: "no voice.toml", hint: "create it" }],
    };
    const report = dekcReport([run(["lint", "--json"], { stdout: JSON.stringify(envelope) })]);
    expect(report.seen.map(({ kind, id, hint }) => ({ kind, id, hint }))).toEqual([
      { kind: "error", id: undefined, hint: "fix each error" },
      { kind: "diagnostic", id: "DEK030", hint: "cut it" },
      { kind: "skipped", id: "voice", hint: "create it" },
    ]);
  });

  test("counts a run made again with the same answer, not one whose answer changed", () => {
    const failing = { exitCode: 1, stdout: "slides/a.html: DEK030 overflows\n" };
    const report = dekcReport([
      run(["lint"], failing),
      run(["lint"], failing),
      run(["lint"], { ...failing, cwd: "decks/talk" }),
      run(["lint"], failing),
      run(["lint"]),
    ]);
    expect(report.repeated).toEqual([{ command: "dekc lint", times: 3 }]);
  });

  test("says whether a command a hint named ran later, as typed or with --json", () => {
    const hint = "run `dekc mv intro welcome`, or `dekc show file/launch <slug>`, or `dekc sync`";
    const report = dekcReport([
      run(["sync"]),
      run(["lint"], {
        exitCode: 1,
        stdout: `slides/intro.html: DEK002 orphan\n  help: ${hint}\n`,
        stderr: "error: lint found 1 error\n  help: fix it, then run `dekc lint` again\n",
      }),
      run(["mv", "intro", "welcome", "--json"], { exitCode: 1 }),
      run(["show", "file/launch", "pricing"]),
      run(["lint"]),
    ]);
    expect(report.hinted).toEqual([
      { command: "dekc mv intro welcome", ran: true, exitCode: 1 },
      { command: "dekc show file/launch <slug>", ran: true, exitCode: 0 },
      { command: "dekc sync", ran: false },
    ]);
  });
});

describe("leftover", () => {
  test("counts the errors and warnings a --json lint left, by rule", () => {
    const envelope = {
      ok: false,
      error: { message: "lint found 1 error" },
      diagnostics: [
        { id: "DEK035", severity: "warning", message: "breaks inside a phrase" },
        { id: "DEK001", severity: "error", message: "missing slide" },
        { id: "DEK035", severity: "warning", message: "breaks inside a phrase" },
      ],
    };
    expect(leftover(JSON.stringify(envelope))).toEqual({
      errors: 1,
      warnings: 2,
      byRule: { DEK001: 1, DEK035: 2 },
    });
  });

  test("counts nothing left on a clean lint", () => {
    expect(leftover('{"ok":true,"diagnostics":[]}\n')).toEqual({
      errors: 0,
      warnings: 0,
      byRule: {},
    });
  });

  test("counts a lint that could not look as one error, and its warnings as unknown", () => {
    const envelope = { ok: false, error: { message: "not a dek project" } };
    expect(leftover(JSON.stringify(envelope))).toEqual({ errors: 1, warnings: null, byRule: {} });
    expect(leftover("Segmentation fault\n")).toEqual({ errors: 1, warnings: null, byRule: {} });
  });
});

/** A run as the runner reports it, with what each test sets. */
const runReport = (over: Partial<RunReport> = {}): RunReport => ({
  scenario: "overflow",
  run: 1,
  outcome: "passed",
  reasons: [],
  wallMs: 60_000,
  agent: { exitCode: 0, timedOut: false },
  dekc: dekcReport([]),
  left: { errors: 0, warnings: 0, byRule: {} },
  dir: "/tmp/dek-eval/overflow/1",
  ...over,
});

const evalReport = (runs: RunReport[]): EvalReport => ({
  agent: "claude -p",
  startedAt: "2026-11-11T09:30:00.000Z",
  scenarios: [{ id: "overflow", prompt: "Fix the timing slide.", runs }],
});

describe("markdown", () => {
  test("shows the warnings each run left, with the rules that left them", () => {
    const text = markdown(
      evalReport([
        runReport({ left: { errors: 0, warnings: 2, byRule: { DEK035: 1, DEK036: 1 } } }),
        runReport({ run: 2, left: { errors: 1, warnings: 0, byRule: { DEK001: 1 } } }),
      ]),
    );
    expect(text).toContain("| warnings left |");
    expect(text).toMatch(/^\| overflow \| 2\/2 \|.*\| 2 \/ 0 \|$/m);
    expect(text).toContain("Left after the run: 0 errors, 2 warnings (DEK035 ×1, DEK036 ×1).");
    expect(text).toContain("Left after the run: 1 error, 0 warnings (DEK001 ×1).");
  });

  test("shows the warnings of a run whose lint could not look as unknown, not as none", () => {
    const text = markdown(
      evalReport([
        runReport({ left: { errors: 0, warnings: 1, byRule: { DEK035: 1 } } }),
        runReport({ run: 2, outcome: "failed", left: { errors: 1, warnings: null, byRule: {} } }),
      ]),
    );
    expect(text).toMatch(/^\| overflow \| 1\/2 \|.*\| 1 \/ \? \|$/m);
    expect(text).toContain(
      "Left after the run: 1 error, warnings unknown: lint printed no list of diagnostics.",
    );
  });
});

/** The dek a summary in these tests measured. */
const measured = { dek: "0.6.2", commit: "d9a6bcc" };

describe("summarize", () => {
  const repeated = (times: number): Invocation[] =>
    Array.from({ length: times }, () => run(["lint"], { stdout: "x: DEK036 warning: o\n" }));

  test("keeps medians and totals per scenario, and no paths, transcripts, or agent text", () => {
    const report = evalReport([
      runReport({
        wallMs: 30_000,
        dekc: dekcReport([...repeated(2), run(["build"])]),
        left: { errors: 0, warnings: 1, byRule: { DEK035: 1 } },
        transcript: { bash: ["cat /tmp/secret"], denied: 0, result: "All done, see /tmp" },
      }),
      runReport({
        run: 2,
        outcome: "failed",
        reasons: ["/tmp/dek-eval/x is wrong"],
        wallMs: 90_000,
        dekc: dekcReport([
          run(["lint"], { exitCode: 1, stderr: "error: deck not found\n" }),
          run(["lint"], { exitCode: 2, stderr: "error: something else\n" }),
        ]),
        left: { errors: 1, warnings: 3, byRule: { DEK001: 1, DEK035: 3 } },
      }),
      runReport({ run: 3, wallMs: 60_000, dekc: dekcReport(repeated(4)) }),
      runReport({ run: 4, outcome: "skipped", reasons: ["no Playwright"], wallMs: 0 }),
    ]);
    const summary = summarize(report, { dek: "0.6.2", commit: "d9a6bcc" });
    expect(summary).toEqual({
      dek: "0.6.2",
      commit: "d9a6bcc",
      date: "2026-11-11",
      scenarios: [
        {
          id: "overflow",
          runs: 3,
          passed: 2,
          skipped: 1,
          medianWallMs: 60_000,
          medianDekcRuns: 3,
          medianRepeats: 1,
          unhintedErrors: 2,
          medianErrorsLeft: 0,
          medianWarningsLeft: 1,
        },
      ],
    });
    expect(JSON.stringify(summary)).not.toContain("/tmp");
  });

  test("takes the mean of the middle two over an even count, and null over no runs", () => {
    const summary = summarize(
      evalReport([
        runReport({ wallMs: 10_000 }),
        runReport({ run: 2, wallMs: 25_000 }),
        runReport({ run: 3, outcome: "skipped", wallMs: 0 }),
      ]),
      measured,
    );
    expect(summary.scenarios[0]?.medianWallMs).toBe(17_500);
    const none = summarize(evalReport([runReport({ outcome: "skipped" })]), measured);
    expect(none.scenarios[0]).toMatchObject({
      runs: 0,
      skipped: 1,
      medianWallMs: null,
      medianErrorsLeft: null,
      medianWarningsLeft: null,
    });
  });

  test("leaves a run whose lint could not look out of the warnings left, not counted as none", () => {
    const blind = { errors: 1, warnings: null, byRule: {} };
    const summary = summarize(
      evalReport([
        runReport({ left: { errors: 0, warnings: 4, byRule: { DEK035: 4 } } }),
        runReport({ run: 2, outcome: "failed", left: blind }),
        runReport({ run: 3, outcome: "failed", left: blind }),
      ]),
      measured,
    );
    expect(summary.scenarios[0]).toMatchObject({ medianErrorsLeft: 1, medianWarningsLeft: 4 });
    const never = summarize(evalReport([runReport({ outcome: "failed", left: blind })]), measured);
    expect(never.scenarios[0]).toMatchObject({ medianErrorsLeft: 1, medianWarningsLeft: null });
  });

  test("keeps the commit measured, or null outside a git checkout", () => {
    expect(summarize(evalReport([runReport()]), measured).commit).toBe("d9a6bcc");
    expect(summarize(evalReport([runReport()]), { dek: "0.6.2", commit: null }).commit).toBeNull();
  });
});

describe("writeRecord", () => {
  test("names the record by its date and dek version, and never overwrites one", () =>
    withTempDir(async (dir) => {
      const summary = summarize(evalReport([runReport()]), measured);
      const first = await writeRecord(dir, summary);
      expect(first).toBe(join(dir, "2026-11-11-v0.6.2.json"));
      expect(await Bun.file(first).json()).toEqual(summary);
      await Bun.write(join(dir, "2026-11-11-v0.6.2-2.json"), "kept\n");
      expect(await writeRecord(dir, summary)).toBe(join(dir, "2026-11-11-v0.6.2-3.json"));
      expect(await Bun.file(join(dir, "2026-11-11-v0.6.2-2.json")).text()).toBe("kept\n");
      expect(await Bun.file(first).json()).toEqual(summary);
    }));

  test("makes the directory it writes into", () =>
    withTempDir(async (dir) => {
      const summary = summarize(evalReport([runReport()]), measured);
      expect(await writeRecord(join(dir, "results"), summary)).toBe(
        join(dir, "results", "2026-11-11-v0.6.2.json"),
      );
    }));
});

describe("transcriptReport", () => {
  test("lists the Bash commands and the result of a stream-json transcript", () => {
    const events = [
      { type: "system", subtype: "init" },
      {
        type: "assistant",
        message: {
          content: [
            { type: "text", text: "Linting." },
            { type: "tool_use", name: "Bash", input: { command: "cd decks/talk && dekc lint" } },
            { type: "tool_use", name: "Read", input: { file_path: "script.md" } },
          ],
        },
      },
      {
        type: "result",
        num_turns: 4,
        total_cost_usd: 0.12,
        result: "Fixed.",
        permission_denials: [{}],
      },
    ];
    expect(transcriptReport(events.map((event) => JSON.stringify(event)).join("\n"))).toEqual({
      bash: ["cd decks/talk && dekc lint"],
      denied: 1,
      turns: 4,
      costUsd: 0.12,
      result: "Fixed.",
    });
  });

  test("adds nothing for an agent that prints text", () => {
    expect(transcriptReport("I fixed the slide.\n")).toBeUndefined();
  });
});

/** What each scenario seeds, as dek shows it to the agent: a rule, or words of an error. */
const SEEDED: Record<string, string> = {
  overflow: "DEK030",
  "missing-image": "DEK021",
  "renamed-section": "DEK002",
  "low-contrast": "DEK031",
  "mistyped-deck": 'deck "kenote" not found',
  "ref-edit": "refs are read-only",
  "check-without-voice": "voice",
  "from-script": "DEK001",
  "ja-line-break": "DEK035",
  "over-time": "DEK041",
  "start-from-nothing": "not a dek project",
};

describe("scenarios", () => {
  test("each has its own id and prompt, and the test knows what it seeds", () => {
    expect(new Set(scenarios.map((scenario) => scenario.id)).size).toBe(scenarios.length);
    expect(new Set(scenarios.map((scenario) => scenario.prompt)).size).toBe(scenarios.length);
    expect(scenarios.map((scenario) => scenario.id).sort()).toEqual(Object.keys(SEEDED).sort());
  });
});

describe.skipIf(!endToEnd)(`scenarios end to end${unlessOptedIn}`, () => {
  for (const scenario of scenarios) {
    // dekc check renders in Chromium whenever Playwright is there, so none of these overlap.
    const scenarioTest = scenario.needsBrowser ? test.serial.skipIf(noBrowser) : test.serial;
    scenarioTest(
      `${scenario.id}: fails as set up, passes after the known solution`,
      () =>
        withTempDir(async (out) => {
          const idle = await runScenario(scenario, { agent: "true", out, run: 1 });
          expect(idle.outcome).toBe("failed");
          expect(idle.reasons.length).toBeGreaterThan(0);
          expect(idle.dekc.invocations).toBe(0);

          const solved = await runScenario(scenario, { agent: fakeAgent, out, run: 2 });
          expect(solved).toMatchObject({ outcome: "passed", reasons: [] });
          expect(solved.dekc.invocations).toBeGreaterThan(0);
          const seeded = SEEDED[scenario.id] ?? "";
          expect(
            solved.dekc.seen.some((entry) => entry.id === seeded || entry.message.includes(seeded)),
          ).toBe(true);
          expect(solved.transcript?.bash.length).toBe(
            scenario.solution.filter((step) => typeof step === "string").length,
          );
          expect(await Bun.file(join(out, scenario.id, "2", "dekc.jsonl")).text()).not.toBe("");
          // What lint left is measured apart from the check: a seeded rule is there before.
          if (/^DEK\d{3}$/.test(seeded)) {
            expect(idle.left.byRule[seeded]).toBeGreaterThan(0);
            expect(solved.left.byRule[seeded]).toBeUndefined();
          }
        }),
      SCENARIO_MS,
    );
  }
});

/** A scenario's project as set up, then changed by `wrong`, as the check judges it. */
async function checkAfter(scenario: Scenario, wrong: (dir: string) => Promise<void>) {
  return withTempDir(async (dir) => {
    const project = openProject(dir, scenario.env);
    await scenario.setup(project);
    await wrong(dir);
    return scenario.check(project);
  });
}

describe.skipIf(!endToEnd)(`checks that a lint pass alone does not satisfy${unlessOptedIn}`, () => {
  /** What over-time's check says of the script as set up, which runs long. */
  const tooLong = "script.md reads in about 4:53 at dek's default rate, too far from 3m";
  const byId = (id: string): Scenario =>
    scenarios.find((scenario) => scenario.id === id) as Scenario;

  test("ref-edit: an edit made inside the ref fails though lint passes", async () => {
    const found = await checkAfter(byId("ref-edit"), async (dir) => {
      const path = join(dir, "refs/file/launch/decks/launch/slides/pricing.html");
      await Bun.write(path, (await Bun.file(path).text()).replace("five", "ten"));
    });
    expect(found).toEqual([
      expect.stringContaining("slides/pricing.html was edited, though a ref is read-only"),
      expect.stringContaining("no deck of the project's own"),
    ]);
  });

  test("check-without-voice: a voice set up where no engine runs fails", async () => {
    const found = await checkAfter(byId("check-without-voice"), async (dir) => {
      await mkdir(join(dir, "decks/talk/voice"), { recursive: true });
      await Bun.write(
        join(dir, "decks/talk/voice/voice.toml"),
        'speaker = "ずんだもん/ノーマル"\n',
      );
      const path = join(dir, "decks/talk/slides/timing.html");
      await Bun.write(path, (await Bun.file(path).text()).replace("<img ", '<img alt="A clock" '));
    });
    expect(found).toEqual([expect.stringContaining("voicevox was not found")]);
  });

  test.skipIf(noBrowser)(
    "from-script: the skeletons dekc sync writes fail though lint passes",
    async () => {
      const found = await checkAfter(byId("from-script"), async (dir) => {
        await must(openProject(dir).dekc(["sync"], { cwd: "decks/talk" }), "dekc sync");
      });
      expect(found).toEqual(
        ["twelve-minutes", "profile", "cache", "split", "ninety-seconds"].map(
          (slug) => `slides/${slug}.html is still the skeleton dek wrote`,
        ),
      );
    },
    SCENARIO_MS,
  );

  /** from-script's deck with each slide in `slides`, by its section's id. */
  const slidesOf = (slides: Record<string, string>) => async (dir: string) => {
    for (const [slug, html] of Object.entries(slides)) {
      await Bun.write(join(dir, "decks/talk/slides", `${slug}.html`), html);
    }
  };
  const fromScript = ["twelve-minutes", "profile", "cache", "split", "ninety-seconds"];
  const titleSlide = (title: string, body = ""): string =>
    `<section class="slide" data-layout="${body ? "default" : "title"}">\n  <h2 class="slide-title">${title}</h2>\n${body}</section>\n`;

  test.skipIf(noBrowser)(
    "from-script: one slide of a few words copied for every section fails though lint passes",
    async () => {
      const junk = titleSlide("Fourteen batched installs keyed on a lockfile");
      const found = await checkAfter(
        byId("from-script"),
        slidesOf(Object.fromEntries(fromScript.map((slug) => [slug, junk]))),
      );
      // "Fourteen" is not "four": a word counts only whole.
      expect(found).toContain(
        "slides/split.html shows fewer than two of the things said in its section",
      );
      expect(found).toEqual(
        expect.arrayContaining(
          fromScript
            .slice(1)
            .map((slug) => `slides/${slug}.html shows the same text as slides/twelve-minutes.html`),
        ),
      );
    },
    SCENARIO_MS,
  );

  test.skipIf(noBrowser)(
    "from-script: slides that carry each section's figures in digits pass",
    async () => {
      const found = await checkAfter(
        byId("from-script"),
        slidesOf({
          "twelve-minutes": titleSlide("12 minutes a push, 40 pushes a day"),
          profile: titleSlide(
            "Where the time went",
            "  <ul>\n    <li>Install: 5 min</li>\n    <li>Build: 2 min</li>\n    <li>Tests: 5 min</li>\n  </ul>\n",
          ),
          cache: titleSlide("Cache the dependencies on the lockfile"),
          split: titleSlide("Tests split 4 ways"),
          "ninety-seconds": titleSlide("From 12 minutes to 90 seconds"),
        }),
      );
      expect(found).toEqual([]);
    },
    SCENARIO_MS,
  );

  test.skipIf(noBrowser)(
    "ja-line-break: a paragraph cut short enough to fit fails though lint passes",
    async () => {
      const found = await checkAfter(byId("ja-line-break"), async (dir) => {
        const path = join(dir, "decks/talk/slides/problem.html");
        await Bun.write(
          path,
          (await Bun.file(path).text()).replace(
            /<p class="lead">.*<\/p>/,
            '<p class="lead">見落としが増えた</p>',
          ),
        );
      });
      expect(found).toEqual([
        "the paragraph on slides/problem.html is not the text the user wrote",
      ]);
    },
    SCENARIO_MS,
  );

  /** ja-line-break's file at `path`, through `change`. */
  const edit = (path: string, change: (text: string) => string) => async (dir: string) => {
    const file = Bun.file(join(dir, path));
    await Bun.write(file, change(await file.text()));
  };
  /** The known fix: the rule that takes phrase breaking from the paragraph, gone. */
  const phrased = edit("decks/talk/slides/problem.css", (css) =>
    css.replace("  word-break: normal;\n", ""),
  );

  test.skipIf(noBrowser)(
    "ja-line-break: breaking anywhere instead of by phrase fails though lint passes",
    async () => {
      const found = await checkAfter(
        byId("ja-line-break"),
        edit("decks/talk/slides/problem.css", (css) => css.replace("normal", "break-all")),
      );
      expect(found).toEqual([
        "decks/talk/slides/problem.css sets word-break: break-all, which breaks inside a phrase",
      ]);
    },
    SCENARIO_MS,
  );

  test.skipIf(noBrowser)(
    "ja-line-break: a rule added to theme.css that breaks anywhere fails though lint passes",
    async () => {
      const found = await checkAfter(byId("ja-line-break"), async (dir) => {
        await phrased(dir);
        await edit(
          "decks/talk/theme.css",
          (css) => `${css}\n.slide .lead { line-break: anywhere; }\n`,
        )(dir);
      });
      expect(found).toEqual([
        "decks/talk/theme.css sets line-break: anywhere, which breaks inside a phrase",
      ]);
    },
    SCENARIO_MS,
  );

  test.skipIf(noBrowser)(
    "ja-line-break: the fixed deck passes once built, though the build breaks by keep-all",
    async () => {
      const found = await checkAfter(byId("ja-line-break"), async (dir) => {
        await phrased(dir);
        await must(openProject(dir).dekc(["build"], { cwd: "decks/talk" }), "dekc build");
      });
      expect(found).toEqual([]);
    },
    SCENARIO_MS,
  );

  test.skipIf(noBrowser)(
    "ja-line-break: the rule setup wrote is left to DEK035, so a fix by <br> may keep it",
    async () => {
      const found = await checkAfter(byId("ja-line-break"), async () => {});
      expect(found).toEqual([expect.stringContaining("DEK035")]);
    },
    SCENARIO_MS,
  );

  test.skipIf(noBrowser)(
    "ja-line-break: a deck said to be in English fails though lint passes",
    async () => {
      const found = await checkAfter(
        byId("ja-line-break"),
        edit("decks/talk/script.md", (text) =>
          text.replace("duration: 1m\n", "duration: 1m\nlang: en\n"),
        ),
      );
      expect(found).toEqual(["script.md is not the script the user wrote"]);
    },
    SCENARIO_MS,
  );

  test.skipIf(noBrowser)(
    "ja-line-break: a paragraph said to be in English fails though lint passes",
    async () => {
      const found = await checkAfter(
        byId("ja-line-break"),
        edit("decks/talk/slides/problem.html", (html) =>
          html.replace('<p class="lead">', '<p class="lead" lang="en">'),
        ),
      );
      expect(found).toEqual([
        'decks/talk/slides/problem.html sets lang="en", so the text is not broken as Japanese',
      ]);
    },
    SCENARIO_MS,
  );

  test.skipIf(noBrowser)(
    "ja-line-break: the paragraph kept only in a stylesheet fails though lint passes",
    async () => {
      const found = await checkAfter(
        byId("ja-line-break"),
        edit("decks/talk/slides/problem.html", (html) =>
          html.replace(
            /<p class="lead">(.*)<\/p>/,
            '<p class="lead">見落としが増えた</p>\n  <style>/* $1 */</style>',
          ),
        ),
      );
      expect(found).toEqual([
        "decks/talk/slides/problem.html: DEK011 slide contains a <style> element",
        "the paragraph on slides/problem.html is not the text the user wrote",
      ]);
    },
    SCENARIO_MS,
  );

  test.skipIf(noBrowser)(
    "ja-line-break: the paragraph written with character references passes once fixed",
    async () => {
      const found = await checkAfter(byId("ja-line-break"), async (dir) => {
        await phrased(dir);
        await edit("decks/talk/slides/problem.html", (html) =>
          html.replace("待ち時間", "&#x5F85;ち時間").replaceAll("、", "&#12289;"),
        )(dir);
      });
      expect(found).toEqual([]);
    },
    SCENARIO_MS,
  );

  test("over-time: a longer time limit fails though lint passes", async () => {
    const found = await checkAfter(byId("over-time"), async (dir) => {
      const path = join(dir, "decks/talk/script.md");
      await Bun.write(path, (await Bun.file(path).text()).replace("duration: 3m", "duration: 5m"));
    });
    expect(found).toEqual(["script.md no longer has duration: 3m, but 5m", tooLong]);
  });

  test("over-time: cutting the part the user named fails though lint passes", async () => {
    const found = await checkAfter(byId("over-time"), async (dir) => {
      const path = join(dir, "decks/talk/script.md");
      const text = await Bun.file(path).text();
      await Bun.write(path, text.replace(/## Start with an example[\s\S]*?(?=## )/, ""));
      await rm(join(dir, "decks/talk/slides/examples.html"));
    });
    expect(found).toEqual([
      'script.md no longer has the section examples, "Start with an example"',
    ]);
  });

  /** over-time's script with each section's paragraphs, heading first, through `keep`. */
  const recut = (keep: (paragraphs: string[], slug: string) => string[]) => async (dir: string) => {
    const path = join(dir, "decks/talk/script.md");
    const [head = "", ...sections] = (await Bun.file(path).text()).split(/^(?=## )/m);
    const kept = sections.map((section) => {
      const paragraphs = section.trimEnd().split("\n\n");
      return keep(paragraphs, paragraphs[0]?.match(/\{#([\w-]+)\}/)?.[1] ?? "").join("\n\n");
    });
    await Bun.write(path, `${head}${kept.join("\n\n")}\n`);
  };
  /** Each section's heading and what it must say, as the known solution cuts it. */
  const cores = recut((paragraphs) => paragraphs.slice(0, 2));

  test("over-time: a faster speaking rate in the frontmatter fails though lint passes", async () => {
    const found = await checkAfter(byId("over-time"), async (dir) => {
      const path = join(dir, "decks/talk/script.md");
      await Bun.write(
        path,
        (await Bun.file(path).text()).replace(
          "duration: 3m\n",
          "duration: 3m\nlatin_per_minute: 230\n",
        ),
      );
    });
    expect(found).toEqual([
      "script.md sets latin_per_minute, which changes the rate the talk is timed at",
      tooLong,
    ]);
  });

  test("over-time: a speaking rate in dek.toml fails", async () => {
    const found = await checkAfter(byId("over-time"), async (dir) => {
      const path = join(dir, "dek.toml");
      await Bun.write(path, `latin_per_minute = 230\n${await Bun.file(path).text()}`);
    });
    expect(found).toContain(
      "dek.toml sets latin_per_minute, which changes the rate the talk is timed at",
    );
    expect(found).toContain(tooLong);
  });

  test("over-time: what was cut kept as a blockquote fails though lint passes", async () => {
    const found = await checkAfter(
      byId("over-time"),
      recut(([heading = "", core = "", extra = ""]) => [heading, core, extra.replace(/^/gm, "> ")]),
    );
    expect(found).toEqual(["script.md has blockquotes, which the timing leaves out", tooLong]);
  });

  test("over-time: the part the user named left with its heading and no words fails", async () => {
    const found = await checkAfter(
      byId("over-time"),
      recut((paragraphs, slug) => (slug === "examples" ? paragraphs.slice(0, 1) : paragraphs)),
    );
    expect(found).toEqual([
      'the section examples, "Start with an example", no longer says "start every page with an example"',
    ]);
  });

  test("over-time: the cut script passes with a comment on its time limit", async () => {
    const found = await checkAfter(byId("over-time"), async (dir) => {
      await cores(dir);
      const path = join(dir, "decks/talk/script.md");
      await Bun.write(
        path,
        (await Bun.file(path).text()).replace("duration: 3m\n", "duration: 3m # the slot I have\n"),
      );
    });
    expect(found).toEqual([]);
  });

  test("start-from-nothing: a project whose deck has another name fails though lint passes", async () => {
    const found = await checkAfter(byId("start-from-nothing"), async (dir) => {
      await must(
        openProject(dir).dekc(["init", ".", "--deck", "talk", "--no-install"]),
        "dekc init",
      );
    });
    expect(found).toEqual(["there is no decks/lt/script.md"]);
  });
});

describe.skipIf(!endToEnd)(`scripts/agent-eval.ts${unlessOptedIn}`, () => {
  const script = join(repoRoot, "scripts", "agent-eval.ts");

  test(
    "runs a scenario --runs times, writes report.json and report.md, and --record a summary",
    () =>
      withTempDir(async (dir) => {
        const out = join(dir, "out");
        const record = join(dir, "results");
        const proc = Bun.spawn(
          [
            process.execPath,
            script,
            "--agent",
            fakeAgent,
            "--scenario",
            "mistyped-deck",
            "--runs",
            "2",
            "--out",
            out,
            "--record",
            record,
          ],
          { stdout: "pipe", stderr: "pipe" },
        );
        const [stdout, exitCode] = await Promise.all([
          new Response(proc.stdout).text(),
          proc.exited,
        ]);
        expect(exitCode).toBe(0);
        const report = await Bun.file(join(out, "report.json")).json();
        expect(report.scenarios).toHaveLength(1);
        expect(report.scenarios[0].runs.map((entry: { outcome: string }) => entry.outcome)).toEqual(
          ["passed", "passed"],
        );
        const text = await Bun.file(join(out, "report.md")).text();
        expect(text).toContain("| mistyped-deck | 2/2 |");
        expect(stdout).toContain(text);

        const kept = readdirSync(record);
        expect(kept).toEqual([`${report.startedAt.slice(0, 10)}-v${pkg.version}.json`]);
        const summary = await Bun.file(join(record, kept[0] ?? "")).text();
        const commit = Bun.spawnSync(["git", "rev-parse", "--short", "HEAD"], { cwd: repoRoot });
        expect(JSON.parse(summary).commit).toBe(commit.stdout.toString().trim());
        expect(JSON.parse(summary).scenarios).toEqual([
          expect.objectContaining({ id: "mistyped-deck", runs: 2, passed: 2, skipped: 0 }),
        ]);
        expect(summary).not.toContain(dir);
        expect(stdout).toContain(`wrote ${join(record, kept[0] ?? "")}`);
        await rm(out, { recursive: true, force: true });
      }),
    SCENARIO_MS,
  );

  test("names the scenarios when asked for one that does not exist", async () => {
    const proc = Bun.spawn([process.execPath, script, "--scenario", "nope"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stderr, exitCode] = await Promise.all([new Response(proc.stderr).text(), proc.exited]);
    expect(exitCode).toBe(2);
    expect(stderr).toContain("error: no scenario nope");
    expect(stderr).toContain(`help: use one of: ${scenarios.map((entry) => entry.id).join(", ")}`);
  });
});
