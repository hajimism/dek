import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { refCommand, restoreRef } from "../../src/cli/ref.ts";
import { formatText } from "../../src/cli/result.ts";
import { showCommand } from "../../src/cli/show.ts";
import { loadConfig } from "../../src/core/config.ts";
import { readRefMeta, refDir } from "../../src/core/ref.ts";
import { jsonStdout, runDek } from "../helpers/cli.ts";
import {
  deckRepoFiles,
  type FakeRepo,
  SHA_A,
  SHA_B,
  withFakeGithub,
} from "../helpers/fake-github.ts";
import { withTempProject } from "../helpers/project.ts";

const REF = "someone/talks/why-dek";

/**
 * Serial because each test points process.env at its own fake GitHub; the
 * longer timeout covers the fake serving tarballs while the suite runs.
 */
function refTest(name: string, fn: () => Promise<void>): void {
  test.serial(name, fn, 15_000);
}

function talks(): Record<string, FakeRepo> {
  return {
    "someone/talks": {
      head: SHA_A,
      revs: { v1: SHA_B, main: SHA_A },
      commits: {
        [SHA_A]: { ...deckRepoFiles("why-dek", { title: "Why dek" }), LICENSE: "MIT" },
        [SHA_B]: { ...deckRepoFiles("why-dek", { title: "Why dek v1" }), LICENSE: "MIT" },
      },
    },
  };
}

const project = { toml: "# my talks\nmax_classes = 40\n", decks: [{ name: "mine" }] };

function tarballRequests(fake: { requests: Array<{ path: string }> }): number {
  return fake.requests.filter((request) => request.path.includes("/tarball/")).length;
}

describe("dek ref <source>", () => {
  refTest("pins the default branch, fetches the snapshot, and ignores refs/ in git", async () => {
    await withTempProject(project, async (root) => {
      await withFakeGithub(talks(), async (fake) => {
        const result = await runDek(["ref", REF, "--json"], { cwd: root, env: fake.env });
        expect(result.exitCode).toBe(0);
        const json = jsonStdout<{ name: string; rev: string; changed: boolean }>(result);
        expect(json).toMatchObject({ name: REF, rev: SHA_A, changed: true });

        const toml = await readFile(join(root, "dek.toml"), "utf8");
        expect(toml).toBe(`# my talks\nmax_classes = 40\n\n[refs]\n"${REF}" = "${SHA_A}"\n`);
        expect(readRefMeta(refDir(root, REF))?.rev).toBe(SHA_A);
        expect(await readFile(join(root, ".gitignore"), "utf8")).toContain("refs/\n");

        const list = formatText({
          command: "ref",
          data: await refCommand({ cwd: root, args: [] }),
        });
        expect(list).toContain(REF);
        expect(list).toContain("Why dek");
      });
    });
  });

  refTest("running it again with nothing new downloads nothing", async () => {
    await withTempProject(project, async (root) => {
      await withFakeGithub(talks(), async (fake) => {
        await refCommand({ cwd: root, args: [REF] });
        const again = await refCommand({ cwd: root, args: [REF] });
        expect(again).toMatchObject({ action: "add", rev: SHA_A, changed: false });
        expect(tarballRequests(fake)).toBe(1);
        const gitignore = await readFile(join(root, ".gitignore"), "utf8");
        expect(gitignore.match(/^refs\/$/gm)).toHaveLength(1);
      });
    });
  });

  refTest("moves the pin when the source moved, and reports both revs", async () => {
    await withTempProject(project, async (root) => {
      await withFakeGithub(talks(), async (fake) => {
        await refCommand({ cwd: root, args: [REF] });
        fake.repos["someone/talks"] = { ...talks()["someone/talks"], head: SHA_B } as FakeRepo;
        const moved = await refCommand({ cwd: root, args: [REF] });
        expect(moved).toMatchObject({ rev: SHA_B, from: SHA_A, changed: true });
        expect(loadConfig(join(root, "dek.toml")).refs).toEqual({ [REF]: SHA_B });
        expect(formatText({ command: "ref", data: moved })).toContain("bbbbbbb (was aaaaaaa)");
      });
    });
  });

  refTest("pins a tag, and takes a GitHub link", async () => {
    await withTempProject(project, async (root) => {
      await withFakeGithub(talks(), async () => {
        expect(await refCommand({ cwd: root, args: [`${REF}@v1`] })).toMatchObject({ rev: SHA_B });
        const link = "https://github.com/someone/talks/tree/main/decks/why-dek";
        expect(await refCommand({ cwd: root, args: [link] })).toMatchObject({
          name: REF,
          rev: SHA_A,
        });
      });
    });
  });

  refTest("warns when the source has no license", async () => {
    await withTempProject(project, async (root) => {
      const repos = {
        "someone/talks": { head: SHA_A, commits: { [SHA_A]: deckRepoFiles("why-dek") } },
      };
      await withFakeGithub(repos, async () => {
        const result = await refCommand({ cwd: root, args: [REF] });
        expect(result).toMatchObject({ license: null });
        expect(result.action === "add" && result.warnings[0]).toContain("no license");
      });
    });
  });

  refTest("lists the ref in AGENTS.md with how to read it", async () => {
    await withTempProject(project, async (root) => {
      await withFakeGithub(talks(), async () => {
        await refCommand({ cwd: root, args: [REF] });
        const agents = await readFile(join(root, "AGENTS.md"), "utf8");
        expect(agents).toContain("## References");
        expect(agents).toContain(`- \`${REF}\`: Why dek`);
        expect(agents).toContain("dek show <ref> <slug>");
      });
    });
  });
});

describe("dek ref (list) and dek ref rm", () => {
  refTest("lists each pinned ref and says which are not fetched", async () => {
    await withTempProject(project, async (root) => {
      await withFakeGithub(talks(), async () => {
        await refCommand({ cwd: root, args: [REF] });
        await rm(join(root, "refs"), { recursive: true });
        const list = await refCommand({ cwd: root, args: [] });
        expect(list).toEqual({
          action: "list",
          refs: [{ name: REF, rev: SHA_A, fetched: false }],
        });
        expect(formatText({ command: "ref", data: list })).toContain("not fetched");
      });
    });
  });

  refTest("with no refs, points to how to add one", async () => {
    await withTempProject(project, async (root) => {
      const list = await refCommand({ cwd: root, args: [] });
      expect(formatText({ command: "ref", data: list })).toContain("dek ref owner/repo/deck");
    });
  });

  refTest("rm drops the pin, the snapshot, and the AGENTS.md line", async () => {
    await withTempProject(project, async (root) => {
      await withFakeGithub(talks(), async () => {
        await refCommand({ cwd: root, args: [REF] });
        const result = await refCommand({ cwd: root, args: ["rm", REF] });
        expect(result).toMatchObject({ action: "rm", name: REF });
        expect(await readFile(join(root, "dek.toml"), "utf8")).toBe(
          "# my talks\nmax_classes = 40\n",
        );
        expect(existsSync(join(root, "refs"))).toBe(false);
        expect(await readFile(join(root, "AGENTS.md"), "utf8")).not.toContain("## References");
      });
    });
  });

  refTest("rm of a ref that is not added says so", async () => {
    await withTempProject(project, async (root) => {
      await expect(refCommand({ cwd: root, args: ["rm", REF] })).rejects.toMatchObject({
        message: `ref "${REF}" is not added`,
        hint: expect.stringContaining("dek ref"),
      });
    });
  });
});

describe("restoring a snapshot", () => {
  refTest("a pinned ref whose snapshot is gone is fetched again at the pinned commit", async () => {
    await withTempProject(project, async (root) => {
      await withFakeGithub(talks(), async (fake) => {
        await refCommand({ cwd: root, args: [`${REF}@v1`] });
        await rm(join(root, "refs"), { recursive: true });
        fake.repos["someone/talks"] = { ...talks()["someone/talks"], head: SHA_A } as FakeRepo;
        await restoreRef(root, REF);
        expect(readRefMeta(refDir(root, REF))?.rev).toBe(SHA_B);
        expect(showCommand({ cwd: root, slug: "intro", deck: REF }).ref?.rev).toBe(SHA_B);
      });
    });
  });

  refTest(
    "a snapshot at the pinned commit is left alone, and an unpinned ref is left to explain itself",
    async () => {
      await withTempProject(project, async (root) => {
        await withFakeGithub(talks(), async (fake) => {
          await refCommand({ cwd: root, args: [REF] });
          const before = fake.requests.length;
          await restoreRef(root, REF);
          await restoreRef(root, "other/repo/deck");
          expect(fake.requests.length).toBe(before);
        });
      });
    },
  );

  refTest("a snapshot left at another commit is replaced by the pinned one", async () => {
    await withTempProject(project, async (root) => {
      await withFakeGithub(talks(), async () => {
        await refCommand({ cwd: root, args: [REF] });
        const toml = await readFile(join(root, "dek.toml"), "utf8");
        await writeFile(join(root, "dek.toml"), toml.replace(SHA_A, SHA_B));
        await restoreRef(root, REF);
        expect(readRefMeta(refDir(root, REF))?.rev).toBe(SHA_B);
      });
    });
  });
});
