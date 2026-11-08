import { describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { contractIssues, printedBy } from "../../src/cli/contract.ts";
import type { Diagnostic, SkippedCheck } from "../../src/core/diagnostic.ts";
import type { SarifLog } from "../../src/core/sarif.ts";
import { syncDeck } from "../../src/core/sync.ts";
import { jsonStdout, runMain } from "../helpers/cli.ts";
import { withEnv } from "../helpers/env.ts";
import { withTempDir } from "../helpers/fs.ts";
import { installPlugin, quizManifest } from "../helpers/plugin.ts";
import { withTempProject } from "../helpers/project.ts";

const deck = {
  name: "intro",
  script: "---\ntitle: Intro\n---\n\n## first\n\nhello\n",
  slides: { first: '<section class="slide"><h1>hello</h1></section>' },
};

const finding = {
  version: "2.1.0",
  runs: [
    {
      results: [
        {
          ruleId: "QUIZ002",
          level: "error",
          message: { text: "hello shows in the heading" },
          locations: [
            {
              physicalLocation: {
                artifactLocation: { uri: "slides/first.html" },
                region: { startLine: 1 },
              },
            },
          ],
        },
      ],
    },
  ],
};

const twoSlides = {
  name: "intro",
  script: "---\ntitle: Intro\n---\n\nopening\n\n## first\n\nhello\n\n## second\n\nbye\n",
  slides: {
    first: '<section class="slide"><h1>hello</h1></section>',
    second: '<section class="slide"><h1>bye</h1></section>',
  },
};

/** A SARIF result for `quiz`, at `uri` and `startLine` when given. */
function quizResult(ruleId: string, text: string, uri?: string, startLine?: number) {
  return {
    ruleId,
    message: { text },
    ...(uri === undefined
      ? {}
      : {
          locations: [
            {
              physicalLocation: {
                artifactLocation: { uri },
                ...(startLine === undefined ? {} : { region: { startLine } }),
              },
            },
          ],
        }),
  };
}

/**
 * One finding on each slide, two in script.md under a slide's heading (its body, line 9, and the
 * heading, line 11) and one above every heading (line 5), an error on the plugin's own data, and a
 * warning on the deck as a whole. QUIZ001 is an error and QUIZ002 a warning, by the manifest.
 */
const twoSlideFindings = {
  version: "2.1.0",
  runs: [
    {
      results: [
        quizResult("QUIZ002", "on first", "slides/first.html", 1),
        quizResult("QUIZ002", "on second", "slides/second.html", 1),
        quizResult("QUIZ002", "in first's section", "script.md", 9),
        quizResult("QUIZ002", "on second's heading", "script.md", 11),
        quizResult("QUIZ002", "above every section", "script.md", 5),
        quizResult("QUIZ001", "the list does not read", "quiz.yaml", 1),
        quizResult("QUIZ002", "the deck has no closing slide"),
      ],
    },
  ],
};

/** Runs dekc in this process, holding what it prints to the --json contract. */
async function dek(args: string[], cwd: string): Promise<Awaited<ReturnType<typeof runMain>>> {
  const result = await runMain(args, cwd);
  expect(contractIssues(printedBy(args), JSON.parse(result.stdout))).toEqual([]);
  return result;
}

type SyncJson = {
  created: string[];
  updated: string[];
  plugins?: Array<{
    name: string;
    status: string;
    version?: string;
    changes?: string[];
    hint?: string;
  }>;
};
type LintJson = { ok: boolean; diagnostics: Diagnostic[]; skipped?: SkippedCheck[] };

/** A project naming `quiz`, and the plugin installed in a folder outside it, on PATH. */
async function withQuiz(
  fn: (root: string, plugin: ReturnType<typeof installPlugin>) => Promise<void>,
  toml = "[plugins.quiz]\n",
): Promise<void> {
  await withTempDir((outside) =>
    withTempProject({ toml, decks: [deck] }, async (root) => {
      const binDir = join(outside, "bin");
      mkdirSync(binDir);
      const plugin = installPlugin(binDir, "quiz", { manifest: quizManifest(), sarif: finding });
      // The plugin's folder, and the one bun is in for the wrapper; nothing of the project's.
      const env = { PATH: [binDir, dirname(process.execPath)].join(delimiter) };
      await withEnv(env, () => fn(root, plugin));
    }),
  );
}

describe("dekc sync and lint with a plugin", () => {
  test.serial(
    "pins the plugin, lists it in AGENTS.md, and lint runs it with dek's rules",
    async () => {
      await withQuiz(async (root, plugin) => {
        const sync = await dek(["sync", "--json"], root);
        expect(sync.exitCode).toBe(0);
        const synced = jsonStdout<SyncJson>(sync);
        expect(synced.plugins).toEqual([{ name: "quiz", status: "accepted", version: "0.1.0" }]);
        expect(synced.created).toContain(join("plugins", "quiz", "plugin.json"));
        expect(readFileSync(join(root, "AGENTS.md"), "utf8")).toContain(
          "- `quiz` 0.1.0: It checks QUIZ001 and QUIZ002. Its data: `quiz.yaml`.",
        );

        const lint = await dek(["lint", "--json"], root);
        const linted = jsonStdout<LintJson>(lint);
        expect(linted.diagnostics).toContainEqual({
          id: "QUIZ002",
          severity: "warning",
          message: "hello shows in the heading",
          path: join("decks", "intro", "slides", "first.html"),
          line: 1,
          slug: "first",
        });
        expect(linted.skipped?.some((entry) => entry.check === "plugin")).toBeFalsy();
        expect(plugin.calls().filter((call) => call.args[0] === "check")).toHaveLength(1);
      });
    },
  );

  test.serial("gives the plugin a run of its own in SARIF", async () => {
    await withQuiz(async (root) => {
      await runMain(["sync"], root);
      const lint = await runMain(["lint", "--format", "sarif"], root);
      const log = JSON.parse(lint.stdout) as SarifLog;
      const run = log.runs.find((entry) => entry.tool.driver.name === "dek-quiz");
      expect(run?.tool.driver.version).toBe("0.1.0");
      expect(run?.tool.driver.rules?.map((rule) => rule.id)).toEqual(["QUIZ001", "QUIZ002"]);
      expect(run?.results.map((result) => [result.ruleId, result.level])).toEqual([
        ["QUIZ002", "warning"],
      ]);
      const dek = log.runs.find((entry) => entry.tool.driver.name === "dek");
      expect(dek?.results.some((result) => result.ruleId === "QUIZ002")).toBe(false);
    });
  });

  test.serial("reports a finding on the project's data once, not once for each deck", async () => {
    await withTempDir((outside) =>
      withTempProject(
        { toml: "[plugins.quiz]\n", decks: [deck, { ...deck, name: "outro" }] },
        async (root) => {
          const binDir = join(outside, "bin");
          mkdirSync(binDir);
          const list = pathToFileURL(join(root, "plugins", "quiz", "quiz.yaml")).href;
          const onList = {
            ruleId: "QUIZ001",
            message: { text: "quiz.yaml does not read" },
            locations: [
              { physicalLocation: { artifactLocation: { uri: list }, region: { startLine: 3 } } },
            ],
          };
          // Said of each deck with no place: one finding per deck, not one for the project.
          const onDeck = { ruleId: "QUIZ002", message: { text: "the deck has no closing slide" } };
          installPlugin(binDir, "quiz", {
            manifest: quizManifest(),
            sarif: {
              version: "2.1.0",
              runs: [{ results: [onList, ...(finding.runs[0]?.results ?? []), onDeck] }],
            },
          });
          const env = { PATH: [binDir, dirname(process.execPath)].join(delimiter) };
          await withEnv(env, async () => {
            await runMain(["sync"], root);
            const linted = jsonStdout<LintJson>(await dek(["lint", "--json"], root));
            const ids = linted.diagnostics.map(({ id, path }) => `${id} ${path}`);
            expect(ids).toEqual([
              `QUIZ001 ${join("plugins", "quiz", "quiz.yaml")}`,
              `QUIZ002 ${join("decks", "intro", "slides", "first.html")}`,
              "QUIZ002 undefined",
              `QUIZ002 ${join("decks", "outro", "slides", "first.html")}`,
              "QUIZ002 undefined",
            ]);
            const sarif = JSON.parse((await runMain(["lint", "--format", "sarif"], root)).stdout);
            const run = (sarif as SarifLog).runs.find((r) => r.tool.driver.name === "dek-quiz");
            expect(run?.results.map((result) => result.ruleId)).toEqual([
              "QUIZ001",
              "QUIZ002",
              "QUIZ002",
              "QUIZ002",
              "QUIZ002",
            ]);
          });
        },
      ),
    );
  });

  test.serial("skips a plugin that changed until the change is accepted", async () => {
    await withQuiz(async (root, plugin) => {
      await runMain(["sync"], root);
      plugin.set({ manifest: quizManifest({ version: "0.2.0" }), sarif: finding });

      const sync = await dek(["sync", "--json"], root);
      expect(jsonStdout<SyncJson>(sync).plugins).toEqual([
        {
          name: "quiz",
          status: "changed",
          version: "0.2.0",
          changes: ["version 0.1.0 → 0.2.0"],
          hint: "the user accepts it with `dekc sync --accept quiz`",
        },
      ]);
      const text = await runMain(["sync"], root);
      expect(text.stderr).toContain("plugin quiz changed: version 0.1.0 → 0.2.0");

      const lint = jsonStdout<LintJson>(await dek(["lint", "--json"], root));
      expect(lint.diagnostics.some((d) => d.id === "QUIZ002")).toBe(false);
      expect(lint.skipped).toContainEqual(
        expect.objectContaining({ check: "plugin", plugin: "quiz" }),
      );

      const accept = await dek(["sync", "--accept", "quiz", "--json"], root);
      expect(jsonStdout<SyncJson>(accept).plugins?.[0]?.status).toBe("accepted");
      const after = jsonStdout<LintJson>(await dek(["lint", "--json"], root));
      expect(after.diagnostics.some((d) => d.id === "QUIZ002")).toBe(true);
    });
  });

  test.serial(
    "fails lint when the plugin breaks, printing its manifest or checking, and names it",
    async () => {
      await withQuiz(async (root, plugin) => {
        await runMain(["sync"], root);
        for (const behavior of [{ checkExit: 2 }, { exit: 2 }]) {
          plugin.set({ manifest: quizManifest(), ...behavior });
          const lint = await dek(["lint", "--json"], root);
          expect(lint.exitCode, lint.stdout).toBe(1);
          expect(jsonStdout<LintJson>(lint).diagnostics).toContainEqual(
            expect.objectContaining({
              id: "DEK046",
              message: expect.stringMatching(
                /^dek-quiz 0\.1\.0 (check on intro|manifest) exited 2/,
              ),
              data: { plugin: "quiz", version: "0.1.0" },
            }),
          );
        }
      });
    },
  );

  test.serial("refuses --accept for a plugin dek.toml does not name", async () => {
    await withQuiz(async (root) => {
      const sync = await dek(["sync", "--accept", "glossary", "--json"], root);
      expect(sync.exitCode).not.toBe(0);
      expect(sync.stdout).toContain("glossary");
    });
  });

  test.serial("flags a key in a plugin's table as DEK008", async () => {
    await withQuiz(async (root) => {
      const lint = jsonStdout<LintJson>(await dek(["lint", "--json"], root));
      expect(lint.diagnostics).toContainEqual(
        expect.objectContaining({
          id: "DEK008",
          data: { file: "dek.toml", key: "plugins.quiz.bin" },
        }),
      );
    }, '[plugins.quiz]\nbin = "/tmp/x"\n');
  });

  test.serial("places a finding in script.md on the slide whose section it is in", async () => {
    await withTempDir((outside) =>
      withTempProject({ toml: "[plugins.quiz]\n", decks: [twoSlides] }, async (root) => {
        const binDir = join(outside, "bin");
        mkdirSync(binDir);
        installPlugin(binDir, "quiz", { manifest: quizManifest(), sarif: twoSlideFindings });
        await withEnv({ PATH: [binDir, dirname(process.execPath)].join(delimiter) }, async () => {
          await runMain(["sync"], root);
          const linted = jsonStdout<LintJson>(await dek(["lint", "--json"], root));
          const places = linted.diagnostics
            .filter(({ id }) => id.startsWith("QUIZ"))
            .map(({ message, slug }) => [message, slug]);
          expect(places).toEqual([
            ["on first", "first"],
            ["on second", "second"],
            ["in first's section", "first"],
            ["on second's heading", "second"],
            ["above every section", undefined],
            ["the list does not read", undefined],
            ["the deck has no closing slide", undefined],
          ]);
        });
      }),
    );
  });

  test.serial("the dev server's sync runs no plugin, and writes the same AGENTS.md", async () => {
    await withQuiz(async (root, plugin) => {
      await runMain(["sync"], root);
      const agents = readFileSync(join(root, "AGENTS.md"), "utf8");
      const before = plugin.calls().length;
      syncDeck(join(root, "decks", "intro"));
      expect(plugin.calls()).toHaveLength(before);
      expect(readFileSync(join(root, "AGENTS.md"), "utf8")).toBe(agents);
    });
  });
});

type CheckJson = LintJson & { slug: string };

/** `twoSlides`, with `quiz` installed outside it, on PATH, and pinned. */
async function withQuizOnTwoSlides(
  fn: (root: string, plugin: ReturnType<typeof installPlugin>) => Promise<void>,
): Promise<void> {
  await withTempDir((outside) =>
    withTempProject({ toml: "[plugins.quiz]\n", decks: [twoSlides] }, async (root) => {
      const binDir = join(outside, "bin");
      mkdirSync(binDir);
      const plugin = installPlugin(binDir, "quiz", {
        manifest: quizManifest(),
        sarif: twoSlideFindings,
      });
      const env = { PATH: [binDir, dirname(process.execPath)].join(delimiter) };
      await withEnv(env, async () => {
        await runMain(["sync"], root);
        await fn(join(root, "decks", "intro"), plugin);
      });
    }),
  );
}

describe("dekc check with a plugin", () => {
  test.serial(
    "reports the plugin's findings on the slide, and its errors that are on no slide",
    async () => {
      await withQuizOnTwoSlides(async (deckDir, plugin) => {
        const check = await dek(["check", "first", "--json"], deckDir);
        const found = jsonStdout<CheckJson>(check).diagnostics.filter(({ id }) =>
          id.startsWith("QUIZ"),
        );
        expect(found.map(({ message }) => message)).toEqual([
          "on first",
          "in first's section",
          "the list does not read",
        ]);
        // The list that does not read is an error, so the slide is not done.
        expect(check.exitCode).toBe(1);
        expect(plugin.calls().filter((call) => call.args[0] === "check")).toHaveLength(1);
      });
    },
  );

  test.serial("says a plugin it could not run was skipped, not passed", async () => {
    await withQuizOnTwoSlides(async (deckDir, plugin) => {
      plugin.set({ manifest: quizManifest({ version: "0.2.0" }), sarif: twoSlideFindings });
      const check = jsonStdout<CheckJson>(await dek(["check", "second", "--json"], deckDir));
      expect(check.diagnostics.some(({ id }) => id.startsWith("QUIZ"))).toBe(false);
      expect(check.skipped).toContainEqual(
        expect.objectContaining({ check: "plugin", plugin: "quiz" }),
      );
      const text = await runMain(["check", "second"], deckDir);
      expect(text.stderr).toContain("plugin quiz: skipped");
    });
  });

  test.serial("fails when the plugin breaks, as lint does", async () => {
    await withQuizOnTwoSlides(async (deckDir, plugin) => {
      plugin.set({ manifest: quizManifest(), checkExit: 2 });
      const check = await dek(["check", "second", "--json"], deckDir);
      expect(check.exitCode).toBe(1);
      expect(jsonStdout<CheckJson>(check).diagnostics).toContainEqual(
        expect.objectContaining({ id: "DEK046", data: { plugin: "quiz", version: "0.1.0" } }),
      );
    });
  });
});
