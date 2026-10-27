import { describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { dekcReport, type Invocation, transcriptReport } from "../../evals/agent/report.ts";
import { quote, runScenario } from "../../evals/agent/run.ts";
import { openProject, type Scenario } from "../../evals/agent/scenario.ts";
import { scenarios } from "../../evals/agent/scenarios.ts";
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
});

describe.skipIf(!endToEnd)(`scripts/agent-eval.ts${unlessOptedIn}`, () => {
  const script = join(repoRoot, "scripts", "agent-eval.ts");

  test(
    "runs a scenario --runs times and writes report.json and report.md",
    () =>
      withTempDir(async (dir) => {
        const out = join(dir, "out");
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
