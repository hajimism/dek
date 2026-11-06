import { describe, expect, test } from "bun:test";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { bundledPageEntries, resolvePluginBin } from "../../../src/core/plugin-host.ts";
import { MANIFEST } from "../../../src/plugins/words/manifest.ts";
import { jsonStdout, runMain } from "../../helpers/cli.ts";
import { withEnv } from "../../helpers/env.ts";
import { withTempDir } from "../../helpers/fs.ts";
import { installPlugin } from "../../helpers/plugin.ts";
import { withTempProject } from "../../helpers/project.ts";

const PLUGIN_DIR = join(import.meta.dir, "..", "..", "..", "src", "plugins", "words");

type Lint = {
  diagnostics: Array<{
    id: string;
    severity: string;
    path?: string;
    line?: number;
    column?: number;
  }>;
};

describe("dek-words, the second plugin dek ships", () => {
  test.serial("runs from dek's own files, never a dek-words on PATH, and has no page", async () => {
    await withTempDir(async (outside) => {
      await withTempProject({ toml: "[plugins.words]\n" }, async (root) => {
        const bin = join(outside, "bin");
        mkdirSync(bin);
        installPlugin(bin, "words", { manifest: { ...MANIFEST, version: "9.9.9" } });
        await withEnv({ PATH: `${bin}:${process.env.PATH ?? ""}` }, async () => {
          expect(resolvePluginBin("words", root)).toBe(join(PLUGIN_DIR, "main.ts"));
        });
        expect(Object.keys(bundledPageEntries())).toEqual(["study"]);
      });
    });
  });

  test("shares only the published types with dek, never its code", () => {
    for (const file of readdirSync(PLUGIN_DIR)) {
      const source = readFileSync(join(PLUGIN_DIR, file), "utf8");
      for (const [, from] of source.matchAll(/from "([^"]+)"/g)) {
        const own = from?.startsWith("./") || from?.startsWith("node:");
        expect({ file, from, allowed: own || from === "../../plugin-api.ts" }).toMatchObject({
          allowed: true,
        });
      }
    }
  });

  test.serial(
    "checks every deck against the project's list, which dekc sync names in AGENTS.md",
    async () => {
      const deck = (name: string) => ({
        name,
        script: "---\ntitle: 話\n---\n\n## first\n\n外まで効いている\n",
        slides: { first: '<section class="slide"><h1>物差しで測る</h1></section>' },
      });
      await withTempProject(
        { toml: "[plugins.words]\n", decks: [deck("intro"), deck("outro")] },
        async (root) => {
          mkdirSync(join(root, "plugins", "words"), { recursive: true });
          writeFileSync(
            join(root, "plugins", "words", "words.yaml"),
            "version: 1\nwords:\n  - word: 効く\n    verb: godan\n  - word: 物差し\n  - word: 盤石\n    verb: five\n",
          );
          writeFileSync(
            join(root, "decks", "outro", "words.yaml"),
            "version: 1\nallow:\n  - 物差し\n",
          );
          const sync = jsonStdout<{ plugins: unknown[] }>(await runMain(["sync", "--json"], root));
          expect(sync.plugins).toEqual([
            { name: "words", status: "accepted", version: MANIFEST.version },
          ]);
          expect(readFileSync(join(root, "AGENTS.md"), "utf8")).toContain(
            `- \`words\` ${MANIFEST.version}: \`dekc lint\` checks WORDS001 and WORDS002. Its data: \`plugins/words/words.yaml\`, \`words.yaml\`.`,
          );
          const lint = jsonStdout<Lint>(await runMain(["lint", "--json"], root));
          const found = lint.diagnostics
            .filter((d) => d.id.startsWith("WORDS") || d.id === "DEK046")
            .map(({ id, path, line, column }) => `${id} ${path}:${line}:${column}`);
          expect(found).toEqual([
            `WORDS002 ${join("plugins", "words", "words.yaml")}:6:undefined`,
            `WORDS001 ${join("decks", "intro", "script.md")}:7:4`,
            `WORDS001 ${join("decks", "intro", "slides", "first.html")}:1:28`,
            `WORDS001 ${join("decks", "outro", "script.md")}:7:4`,
          ]);
        },
      );
    },
  );

  test.serial("fails lint once, not once a deck, when the project has no list", async () => {
    const deck = (name: string) => ({ name, slides: { first: "<h1>物差し</h1>" } });
    await withTempProject(
      { toml: "[plugins.words]\n", decks: [deck("intro"), deck("outro")] },
      async (root) => {
        await runMain(["sync"], root);
        const linted = await runMain(["lint", "--json"], root);
        const found = jsonStdout<Lint>(linted)
          .diagnostics.filter((d) => d.id.startsWith("WORDS") || d.id === "DEK046")
          .map(({ id, path, line }) => `${id} ${path}:${line}`);
        expect(found).toEqual([`WORDS002 ${join("plugins", "words", "words.yaml")}:undefined`]);
        expect(linted.exitCode).not.toBe(0);
      },
    );
  });
});
