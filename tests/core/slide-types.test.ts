import { describe, expect, test } from "bun:test";
import { existsSync, statSync, utimesSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { initCommand } from "../../src/cli/init.ts";
import { defaultTsconfig, syncDeck } from "../../src/core/sync.ts";
import { withTempDir } from "../helpers/fs.ts";
import { withTempProject } from "../helpers/project.ts";

const TSC = join(import.meta.dir, "..", "..", "node_modules", ".bin", "tsc");

const project = { decks: [{ name: "demo" }] };

/** Runs the tsconfig `dek init` writes, the way an editor would read it. */
async function typecheck(root: string): Promise<{ ok: boolean; output: string }> {
  await writeFile(join(root, "tsconfig.json"), defaultTsconfig());
  // Plain `file(line,col)` output even when the shell forces color, which tsc would follow.
  const result = Bun.spawnSync([TSC, "--pretty", "false", "-p", join(root, "tsconfig.json")], {
    cwd: root,
  });
  return { ok: result.exitCode === 0, output: `${result.stdout}${result.stderr}` };
}

describe("editor types for slide scripts", () => {
  test("dek sync writes .dek/slide.d.ts but leaves tsconfig.json to init", async () => {
    await withTempProject(project, async (root) => {
      syncDeck(join(root, "decks", "demo"));
      const types = await readFile(join(root, ".dek", "slide.d.ts"), "utf8");
      expect(types).toContain("interface DekSlide");
      // Someone who deleted tsconfig.json on purpose should not see it come back.
      expect(existsSync(join(root, "tsconfig.json"))).toBe(false);
    });
  });

  test("dek sync never touches a tsconfig.json the project already has", async () => {
    await withTempProject(project, async (root) => {
      await writeFile(join(root, "tsconfig.json"), "{}\n");
      syncDeck(join(root, "decks", "demo"));
      expect(await readFile(join(root, "tsconfig.json"), "utf8")).toBe("{}\n");
      expect(existsSync(join(root, ".dek", "slide.d.ts"))).toBe(true);
    });
  });

  test("dek sync leaves an up-to-date slide.d.ts alone, so the editor's TS server does not reload", async () => {
    await withTempProject(project, async (root) => {
      const typesPath = join(root, ".dek", "slide.d.ts");
      syncDeck(join(root, "decks", "demo"));
      const past = new Date(Date.now() - 60_000);
      utimesSync(typesPath, past, past);
      syncDeck(join(root, "decks", "demo"));
      expect(statSync(typesPath).mtimeMs).toBe(past.getTime());
    });
  });

  test("dek sync refreshes a stale slide.d.ts", async () => {
    await withTempProject(project, async (root) => {
      const typesPath = join(root, ".dek", "slide.d.ts");
      syncDeck(join(root, "decks", "demo"));
      await writeFile(typesPath, "// old\n");
      syncDeck(join(root, "decks", "demo"));
      expect(await readFile(typesPath, "utf8")).toContain("interface DekSlide");
    });
  });

  test("dek init writes slide.d.ts and a tsconfig.json that includes it", async () => {
    await withTempDir(async (dir) => {
      const result = initCommand({ cwd: dir, dir: "talks" });
      expect(result.created).toContain(join(dir, "talks", "tsconfig.json"));
      expect(result.created).toContain(join(dir, "talks", ".dek", "slide.d.ts"));
      const tsconfig = JSON.parse(await readFile(join(dir, "talks", "tsconfig.json"), "utf8"));
      expect(tsconfig.include).toEqual([".dek/*.d.ts", "decks/*/slides/*.ts"]);
      expect(tsconfig.compilerOptions.allowJs).toBeUndefined();
      expect(tsconfig.compilerOptions.types).toEqual([]);
    });
  });
});

describe("a TypeScript slide type-checks with only the generated files", () => {
  test("satisfies DekSlide types draw's arguments without any import", async () => {
    await withTempProject(project, async (root) => {
      syncDeck(join(root, "decks", "demo"));
      await writeFile(
        join(root, "decks", "demo", "slides", "intro.ts"),
        `const MS = 900;
export default {
  motion: { intro: MS },
  draw(slide, { index, step, t }) {
    for (const el of slide.querySelectorAll<HTMLElement>("[data-count]")) {
      el.textContent = \`\${index}:\${step}:\${Math.round(Number(el.dataset.count) * (t / MS))}\`;
    }
  },
} satisfies DekSlide;
`,
      );
      const { ok, output } = await typecheck(root);
      expect(output).toBe("");
      expect(ok).toBe(true);
    });
  }, 30_000);

  test("catches a wrong shape, a misspelled frame field, and Node globals", async () => {
    await withTempProject(project, async (root) => {
      syncDeck(join(root, "decks", "demo"));
      await writeFile(
        join(root, "decks", "demo", "slides", "intro.ts"),
        `export default {
  motion: { intro: "fast" },
  draw(slide, frame) {
    slide.textContent = String(frame.time) + process.env.HOME;
  },
} satisfies DekSlide;
`,
      );
      const { ok, output } = await typecheck(root);
      expect(ok).toBe(false);
      expect(output).toContain("intro.ts(2,");
      expect(output).toContain("'time'");
      expect(output).toContain("'process'");
    });
  }, 30_000);
});
