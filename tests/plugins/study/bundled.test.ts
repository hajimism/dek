import { describe, expect, test } from "bun:test";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { installedManifest, resolvePluginBin } from "../../../src/core/plugin-host.ts";
import { MANIFEST } from "../../../src/plugins/study/manifest.ts";
import { jsonStdout, runMain } from "../../helpers/cli.ts";
import { withEnv } from "../../helpers/env.ts";
import { withTempDir } from "../../helpers/fs.ts";
import { installPlugin } from "../../helpers/plugin.ts";
import { withTempProject } from "../../helpers/project.ts";

const PLUGIN_DIR = join(import.meta.dir, "..", "..", "..", "src", "plugins", "study");

describe("dek-study, the plugin dek ships", () => {
  test.serial("runs from dek's own files, never a dek-study on PATH", async () => {
    await withTempDir(async (outside) => {
      await withTempProject({ toml: "[plugins.study]\n" }, async (root) => {
        const bin = join(outside, "bin");
        mkdirSync(bin);
        installPlugin(bin, "study", { manifest: { ...MANIFEST, version: "9.9.9" } });
        await withEnv({ PATH: `${bin}:${process.env.PATH ?? ""}` }, async () => {
          expect(resolvePluginBin("study", root)).toBe(join(PLUGIN_DIR, "main.ts"));
          expect(await installedManifest("study", root)).toMatchObject({
            state: "ready",
            manifest: { name: "study", version: MANIFEST.version },
          });
        });
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
    "is pinned by dekc sync and checks a deck in dekc lint, with nothing installed",
    async () => {
      await withTempProject(
        {
          toml: "[plugins.study]\n",
          decks: [
            {
              name: "intro",
              script: "---\ntitle: 入門\n---\n\n## first\n\n計画錯誤\n",
              slides: {
                first:
                  '<section class="slide"><h1>計画錯誤</h1><p>外部視点で見積もる</p></section>',
              },
            },
          ],
        },
        async (root) => {
          writeFileSync(
            join(root, "decks", "intro", "study.yaml"),
            "version: 1\nstickers:\n  - id: s1\n    slide: first\n    quote: 内部視点\n  - id: s2\n    slide: first\n    quote: 外部視点\n",
          );
          const sync = jsonStdout<{ plugins: unknown[] }>(await runMain(["sync", "--json"], root));
          expect(sync.plugins).toEqual([
            { name: "study", status: "accepted", version: MANIFEST.version },
          ]);
          expect(readFileSync(join(root, "AGENTS.md"), "utf8")).toContain(
            `- \`study\` ${MANIFEST.version}: It checks STUDY001 to STUDY003. Its data: \`study.yaml\` in each deck. Its page takes the key \`r\`. How to write it: https://hajimism.github.io/dek/reference/plugins.html#dek-study`,
          );
          const lint = jsonStdout<{ diagnostics: Array<{ id: string; line?: number }> }>(
            await runMain(["lint", "--json"], root),
          );
          expect(
            lint.diagnostics.filter((d) => d.id.startsWith("STUDY") || d.id === "DEK046"),
          ).toEqual([expect.objectContaining({ id: "STUDY001", severity: "error", line: 3 })]);
        },
      );
    },
  );
});
