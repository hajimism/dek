import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { lockText, readManifest } from "../../src/core/plugin.ts";
import {
  checkDeck,
  installedManifest,
  pinnedPlugins,
  pluginChecks,
  resolvePluginBin,
  syncPlugins,
} from "../../src/core/plugin-host.ts";
import { resolveProject } from "../../src/core/resolve.ts";
import { withEnv } from "../helpers/env.ts";
import { withTempDir } from "../helpers/fs.ts";
import { installPlugin, quizManifest } from "../helpers/plugin.ts";
import { withTempProject } from "../helpers/project.ts";

const QUIZ = "[plugins.quiz]\n";

const deckSpec = {
  name: "intro",
  script: "---\ntitle: Intro\nlang: ja\n---\n\n## first\n\nhello\n\n## second\n\nworld\n",
  slides: { first: '<section class="slide"><h1>hello</h1></section>' },
  styles: { first: ".slide h1 { color: red; }" },
};

function sarif(results: unknown[]): unknown {
  return { version: "2.1.0", runs: [{ tool: { driver: { name: "dek-quiz" } }, results }] };
}

function accepted(overrides: Record<string, unknown> = {}) {
  const reading = readManifest(quizManifest(overrides), "quiz");
  if (!reading.ok) {
    throw new Error(reading.reason);
  }
  return reading.manifest;
}

/** A project with `toml`, a bin folder outside it on PATH, and nothing else there. */
async function withPluginProject<T>(
  toml: string,
  fn: (root: string, binDir: string) => Promise<T>,
): Promise<T> {
  return withTempDir((outside) =>
    withTempProject({ toml, decks: [deckSpec] }, (root) => {
      const binDir = join(outside, "bin");
      mkdirSync(binDir);
      return withEnv({ PATH: binDir }, () => fn(root, binDir));
    }),
  );
}

describe("resolvePluginBin", () => {
  test.serial("finds dek-<name> on PATH, as an absolute path", async () => {
    await withPluginProject(QUIZ, async (root, binDir) => {
      const plugin = installPlugin(binDir, "quiz", { manifest: quizManifest() });
      expect(resolvePluginBin("quiz", root)).toBe(plugin.bin);
      expect(resolvePluginBin("glossary", root)).toBeUndefined();
    });
  });

  test.serial(
    "never takes one from a PATH entry inside the project, or a relative one",
    async () => {
      await withPluginProject(QUIZ, async (root, binDir) => {
        // As bunx, direnv, or mise put a project's own bin on PATH.
        const inside = join(root, "node_modules", ".bin");
        mkdirSync(inside, { recursive: true });
        installPlugin(inside, "quiz", { manifest: quizManifest() });
        // A link outside that leads into the project is the project's folder too.
        const link = join(binDir, "..", "linked");
        symlinkSync(inside, link);
        const cwd = process.cwd();
        try {
          process.chdir(root);
          await withEnv(
            { PATH: [inside, link, "node_modules/.bin", "."].join(delimiter) },
            async () => {
              expect(resolvePluginBin("quiz", root)).toBeUndefined();
            },
          );
        } finally {
          process.chdir(cwd);
        }
      });
    },
  );
});

describe("a plugin installed inside the project", () => {
  test.serial("is named where it is, with how to install it where dek looks", async () => {
    await withPluginProject(QUIZ, async (root) => {
      // As `bun add -d` leaves it, whether or not bunx put the folder on PATH.
      const inside = join(root, "node_modules", ".bin");
      mkdirSync(inside, { recursive: true });
      installPlugin(inside, "quiz", { manifest: quizManifest() });
      const project = resolveProject(root);
      const expected = {
        reason:
          "dek-quiz is in node_modules/.bin, inside the project, where dek never runs a plugin from",
        hint: "install it outside the project, as `bun add -g` does, so that it is on PATH",
      };
      expect((await syncPlugins(project)).plugins).toEqual([
        { name: "quiz", status: "missing", ...expected },
      ]);
      expect((await pluginChecks(project)).skipped).toEqual([
        { check: "plugin", plugin: "quiz", ...expected },
      ]);
    });
  });
});

describe("installedManifest", () => {
  test.serial("reads the manifest the plugin prints", async () => {
    await withPluginProject(QUIZ, async (root, binDir) => {
      const plugin = installPlugin(binDir, "quiz", { manifest: quizManifest() });
      expect(await installedManifest("quiz", root)).toEqual({
        state: "ready",
        name: "quiz",
        bin: plugin.bin,
        manifest: accepted(),
      });
      expect(plugin.calls().map((call) => call.args)).toEqual([["manifest"]]);
    });
  });

  test.serial("says when the plugin is not installed", async () => {
    await withPluginProject(QUIZ, async (root) => {
      expect(await installedManifest("quiz", root)).toEqual({ state: "missing", name: "quiz" });
    });
  });

  test.serial("says why a plugin cannot be used, by its own fault or a newer dek's", async () => {
    await withPluginProject(QUIZ, async (root, binDir) => {
      const plugin = installPlugin(binDir, "quiz", { manifest: quizManifest(), exit: 3 });
      expect(await installedManifest("quiz", root)).toMatchObject({
        state: "broken",
        reason: expect.stringContaining("exited 3"),
      });
      plugin.set({ manifestRaw: "not json" });
      expect(await installedManifest("quiz", root)).toMatchObject({
        state: "broken",
        reason: expect.stringContaining("JSON"),
      });
      plugin.set({ manifest: quizManifest({ name: "other" }) });
      expect(await installedManifest("quiz", root)).toMatchObject({
        state: "broken",
        reason: expect.stringContaining("`other`"),
      });
      plugin.set({ manifest: quizManifest({ schema: 2 }) });
      expect(await installedManifest("quiz", root)).toMatchObject({
        state: "broken",
        unsupported: true,
      });
    });
  });

  test.serial("stops a describe that does not finish", async () => {
    await withPluginProject(QUIZ, async (root, binDir) => {
      installPlugin(binDir, "quiz", { manifest: quizManifest(), sleepMs: 5000 });
      expect(await installedManifest("quiz", root, { timeoutMs: 300 })).toMatchObject({
        state: "broken",
        reason: expect.stringContaining("did not finish"),
      });
    });
  });
});

describe("checkDeck", () => {
  async function check(
    binDir: string,
    root: string,
    behavior: Record<string, unknown>,
    options: { timeoutMs?: number } = {},
  ) {
    const plugin = installPlugin(binDir, "quiz", { manifest: quizManifest(), ...behavior });
    const project = resolveProject(root);
    const deck = project.decks[0];
    if (!deck) {
      throw new Error("no deck");
    }
    const outcome = await checkDeck(
      { name: "quiz", bin: plugin.bin, manifest: accepted() },
      project,
      deck,
      options,
    );
    return { outcome, plugin, deck, project };
  }

  test.serial("hands the plugin the deck on stdin, in the deck's folder", async () => {
    await withPluginProject(QUIZ, async (root, binDir) => {
      const { plugin, deck } = await check(binDir, root, {});
      const [call] = plugin.calls();
      expect(call?.args).toEqual(["check", "--protocol", "1"]);
      expect(call?.cwd).toBe(deck.dir);
      expect(JSON.parse(call?.stdin ?? "")).toEqual({
        protocol: 1,
        dek: expect.any(String),
        deck: {
          name: "intro",
          lang: "ja",
          slides: [
            {
              slug: "first",
              title: "first",
              html: "slides/first.html",
              css: "slides/first.css",
              ts: null,
            },
            { slug: "second", title: "second", html: null, css: null, ts: null },
          ],
        },
      });
    });
  });

  test.serial("reads each finding with the severity the manifest declares", async () => {
    await withPluginProject(QUIZ, async (root, binDir) => {
      const { outcome, deck } = await check(binDir, root, {
        sarif: sarif([
          {
            ruleId: "QUIZ002",
            level: "error",
            message: { text: "「計画錯誤」 shows in the heading" },
            locations: [
              {
                physicalLocation: {
                  artifactLocation: { uri: "slides/first.html" },
                  region: { startLine: 1, startColumn: 22 },
                },
              },
            ],
            properties: { hint: "hide the heading's word too, or pick another" },
          },
          {
            ruleId: "QUIZ001",
            message: { text: "sticker s1 is not on its slide" },
            locations: [
              {
                physicalLocation: {
                  artifactLocation: { uri: "quiz.yaml" },
                  region: { startLine: 4 },
                },
              },
            ],
          },
        ]),
      });
      expect(outcome).toEqual({
        diagnostics: [
          {
            id: "QUIZ002",
            severity: "warning",
            message: "「計画錯誤」 shows in the heading",
            path: join(deck.dir, "slides", "first.html"),
            line: 1,
            column: 22,
            slug: "first",
            hint: "hide the heading's word too, or pick another",
          },
          {
            id: "QUIZ001",
            severity: "error",
            message: "sticker s1 is not on its slide",
            path: join(deck.dir, "quiz.yaml"),
            line: 4,
          },
        ],
      });
    });
  });

  test.serial("keeps a plugin's text to one line, and its locations inside the deck", async () => {
    await withPluginProject(QUIZ, async (root, binDir) => {
      const { outcome } = await check(binDir, root, {
        sarif: sarif([
          {
            ruleId: "QUIZ001",
            message: { text: `two\nlines ${"x".repeat(400)}` },
            locations: [{ physicalLocation: { artifactLocation: { uri: "../../dek.toml" } } }],
            properties: { hint: "a\n## heading" },
          },
        ]),
      });
      const [finding] = outcome.diagnostics;
      expect(finding?.message.startsWith("two lines x")).toBe(true);
      expect(finding?.message.length).toBeLessThanOrEqual(300);
      expect(finding?.hint).toBe("a ## heading");
      expect(finding?.path).toBeUndefined();
    });
  });

  test.serial("reports a plugin that fails as DEK046, naming it and its version", async () => {
    await withPluginProject(QUIZ, async (root, binDir) => {
      const cases: Array<[Record<string, unknown>, string]> = [
        [{ checkExit: 2 }, "exited 2"],
        [{ sarifRaw: "nope" }, "SARIF"],
        [{ sarifRaw: JSON.stringify({ version: "2.1.0" }) }, "SARIF"],
        [{ sarif: sarif([{ ruleId: "QUIZ009", message: { text: "x" } }]) }, "QUIZ009"],
        [{ sarif: sarif([{ ruleId: "QUIZ001" }]) }, "message"],
      ];
      for (const [behavior, says] of cases) {
        const { outcome, project } = await check(binDir, root, behavior);
        expect(outcome.diagnostics).toEqual([
          {
            id: "DEK046",
            severity: "error",
            message: expect.stringMatching(new RegExp(`^dek-quiz 0\\.1\\.0 .*${says}`)),
            path: project.configPath,
            hint: expect.any(String),
            data: { plugin: "quiz", version: "0.1.0" },
          },
        ]);
      }
    });
  });

  test.serial("stops a check that does not finish, and says it hung", async () => {
    await withPluginProject(QUIZ, async (root, binDir) => {
      const { outcome } = await check(binDir, root, { sleepMs: 5000 }, { timeoutMs: 300 });
      expect(outcome.hung).toBe(true);
      expect(outcome.diagnostics[0]?.message).toContain("did not finish");
    });
  });
});

describe("pluginChecks", () => {
  test.serial("runs only a plugin the project accepted, as it was accepted", async () => {
    await withPluginProject(QUIZ, async (root, binDir) => {
      const project = resolveProject(root);
      expect(await pluginChecks(project)).toEqual({
        ready: [],
        skipped: [
          {
            check: "plugin",
            plugin: "quiz",
            reason: "plugins/quiz/plugin.json is missing, so nothing pins what dek-quiz may check",
            hint: "install dek-quiz, then run `dekc sync` to pin it",
          },
        ],
        diagnostics: [],
      });

      const plugin = installPlugin(binDir, "quiz", { manifest: quizManifest() });
      expect((await pluginChecks(project)).skipped[0]?.hint).toBe("run `dekc sync` to pin it");

      mkdirSync(join(root, "plugins", "quiz"), { recursive: true });
      writeFileSync(join(root, "plugins", "quiz", "plugin.json"), lockText(accepted()));
      expect(await pluginChecks(project)).toEqual({
        ready: [{ name: "quiz", bin: plugin.bin, manifest: accepted() }],
        skipped: [],
        diagnostics: [],
      });

      plugin.set({ manifest: quizManifest({ version: "0.2.0" }) });
      expect(await pluginChecks(project)).toEqual({
        ready: [],
        skipped: [
          {
            check: "plugin",
            plugin: "quiz",
            reason:
              "the installed dek-quiz is not the one plugins/quiz/plugin.json pins: version 0.1.0 → 0.2.0",
            hint: "run `dekc sync` to see what changed; the user accepts it with `dekc sync --accept quiz`",
          },
        ],
        diagnostics: [],
      });

      plugin.set({ manifest: quizManifest(), exit: 4 });
      expect(await pluginChecks(project)).toEqual({
        ready: [],
        skipped: [],
        diagnostics: [
          expect.objectContaining({
            id: "DEK046",
            message: "dek-quiz 0.1.0 manifest exited 4",
            data: { plugin: "quiz", version: "0.1.0" },
          }),
        ],
      });
    });
  });

  test.serial(
    "skips a pinned plugin that is not installed, and runs nothing for one with no check",
    async () => {
      await withPluginProject(QUIZ, async (root) => {
        mkdirSync(join(root, "plugins", "quiz"), { recursive: true });
        writeFileSync(join(root, "plugins", "quiz", "plugin.json"), lockText(accepted()));
        const project = resolveProject(root);
        expect((await pluginChecks(project)).skipped).toEqual([
          {
            check: "plugin",
            plugin: "quiz",
            reason: "dek-quiz is not installed",
            hint: "install dek-quiz 0.1.0 on PATH, outside this project",
          },
        ]);
        writeFileSync(
          join(root, "plugins", "quiz", "plugin.json"),
          lockText(accepted({ check: undefined })),
        );
        expect(await pluginChecks(project)).toEqual({ ready: [], skipped: [], diagnostics: [] });
      });
    },
  );
});

describe("syncPlugins", () => {
  const lockPath = (root: string) => join(root, "plugins", "quiz", "plugin.json");

  test.serial("pins a plugin the first time, then leaves it as pinned", async () => {
    await withPluginProject(QUIZ, async (root, binDir) => {
      installPlugin(binDir, "quiz", { manifest: quizManifest() });
      const project = resolveProject(root);
      expect(await syncPlugins(project)).toEqual({
        plugins: [{ name: "quiz", status: "accepted", version: "0.1.0" }],
        created: [lockPath(root)],
        updated: [],
      });
      expect(readFileSync(lockPath(root), "utf8")).toBe(lockText(accepted()));
      expect(await syncPlugins(project)).toEqual({
        plugins: [{ name: "quiz", status: "current", version: "0.1.0" }],
        created: [],
        updated: [],
      });
    });
  });

  test.serial("shows what changed and writes nothing until the change is accepted", async () => {
    await withPluginProject(QUIZ, async (root, binDir) => {
      const plugin = installPlugin(binDir, "quiz", { manifest: quizManifest() });
      const project = resolveProject(root);
      await syncPlugins(project);
      plugin.set({ manifest: quizManifest({ version: "0.2.0", data: [] }) });
      expect(await syncPlugins(project)).toEqual({
        plugins: [
          {
            name: "quiz",
            status: "changed",
            version: "0.2.0",
            changes: ["version 0.1.0 → 0.2.0", "data quiz.yaml removed"],
            hint: "the user accepts it with `dekc sync --accept quiz`",
          },
        ],
        created: [],
        updated: [],
      });
      expect(readFileSync(lockPath(root), "utf8")).toBe(lockText(accepted()));
      expect(await syncPlugins(project, { accept: "quiz" })).toEqual({
        plugins: [{ name: "quiz", status: "accepted", version: "0.2.0" }],
        created: [],
        updated: [lockPath(root)],
      });
    });
  });

  test.serial("says which plugins it could not read, and writes nothing for them", async () => {
    await withPluginProject("[plugins.quiz]\n[plugins.glossary]\n", async (root, binDir) => {
      installPlugin(binDir, "quiz", { manifest: quizManifest({ schema: 2 }) });
      const project = resolveProject(root);
      expect(await syncPlugins(project)).toEqual({
        plugins: [
          {
            name: "glossary",
            status: "missing",
            reason: "dek-glossary is not installed",
            hint: "install dek-glossary on PATH, outside this project",
          },
          {
            name: "quiz",
            status: "unsupported",
            reason: expect.stringContaining("manifest schema 2"),
            hint: "update dek",
          },
        ],
        created: [],
        updated: [],
      });
      expect(existsSync(join(root, "plugins"))).toBe(false);
    });
  });

  test.serial(
    "refuses to accept a plugin dek.toml does not name, before writing anything",
    async () => {
      await withPluginProject(QUIZ, async (root, binDir) => {
        installPlugin(binDir, "quiz", { manifest: quizManifest() });
        const project = resolveProject(root);
        await expect(syncPlugins(project, { accept: "glossary" })).rejects.toThrow(/glossary/);
        expect(existsSync(join(root, "plugins"))).toBe(false);
      });
    },
  );

  test.serial("does nothing for a project that names no plugin", async () => {
    await withPluginProject("# none\n", async (root) => {
      expect(await syncPlugins(resolveProject(root))).toEqual({
        plugins: [],
        created: [],
        updated: [],
      });
    });
  });
});

describe("pinnedPlugins", () => {
  test("lists each plugin dek.toml names, with the manifest its lock pins", async () => {
    await withTempProject({ toml: "[plugins.quiz]\n[plugins.glossary]\n" }, async (root) => {
      mkdirSync(join(root, "plugins", "quiz"), { recursive: true });
      writeFileSync(join(root, "plugins", "quiz", "plugin.json"), lockText(accepted()));
      expect(pinnedPlugins(root)).toEqual([
        { name: "glossary", manifest: undefined },
        { name: "quiz", manifest: accepted() },
      ]);
    });
  });

  test("is empty when dek.toml does not parse, as the commands that read it report", async () => {
    await withTempProject({ toml: "[plugins.quiz\n" }, async (root) => {
      expect(pinnedPlugins(root)).toEqual([]);
    });
  });
});
