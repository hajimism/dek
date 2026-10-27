import { describe, expect, test } from "bun:test";
import { chmod, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { contractIssues, printedBy } from "../../src/cli/contract.ts";
import { resolveTarget } from "../../src/cli/scope.ts";
import { parseShotMode, shotCommand } from "../../src/cli/shot.ts";
import { DekError } from "../../src/core/error.ts";
import { jsonStdout, runDek, runMain } from "../helpers/cli.ts";
import { withEnv } from "../helpers/env.ts";
import { slideDocument } from "../helpers/html.ts";
import { type ProjectSpec, withTempProject } from "../helpers/project.ts";
import { CHROMIUM_MISSING, SANDBOX_REASON, ZYGOTE_REASON } from "../helpers/sandbox.ts";

const introHtml = slideDocument(`<section class="slide" data-layout="title">
  <h2 class="slide-title">intro</h2>
</section>`);

const fakePlaywright = join(import.meta.dir, "..", "helpers", "fake-playwright.ts");

type ShotOk = {
  ok: true;
  shots: Array<{ slug: string; step: string; path: string }>;
};

describe("dekc shot", () => {
  test("writes a screenshot for one slug and returns its path", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        await chmod(fakePlaywright, 0o755);
        const result = await runDek(["shot", "intro", "--json"], {
          cwd: join(root, "decks", "demo"),
          env: { DEK_PLAYWRIGHT: fakePlaywright },
        });
        expect(result).toMatchObject({ exitCode: 0 });
        const json = jsonStdout<ShotOk>(result);
        expect(json.ok).toBe(true);
        expect(json.shots).toHaveLength(1);
        expect(json.shots[0]?.slug).toBe("intro");
        expect(json.shots[0]?.path).toContain(".cache/shots/intro");
        expect(await Bun.file(json.shots[0]?.path ?? "").exists()).toBe(true);
      },
    );
  });
});

describe("dekc shot where Chromium's sandbox cannot start", () => {
  const sandboxless = join(import.meta.dir, "..", "helpers", "fake-playwright-sandboxless.ts");
  const REF = "someone/talks/why-dek";
  const project: ProjectSpec = {
    decks: [{ name: "demo", slides: { intro: introHtml } }],
    refs: [
      {
        name: REF,
        license: "MIT",
        deck: {
          script: "---\ntitle: Why dek\n---\n\n## intro\n\nhello\n",
          slides: { intro: introHtml },
        },
      },
    ],
  };
  const OWN_WARNING = `warning: Chromium drew without its sandbox, which did not start here: ${SANDBOX_REASON}`;
  const REF_WARNING = "warning: Chromium drew a ref without its sandbox";
  const count = (text: string, part: string) => text.split(part).length - 1;

  type ShotUnsandboxed = ShotOk & { unsandboxed?: { reason: string; hint: string } };
  type Refused = { ok: false; error: { message: string; hint?: string } };

  /**
   * `dekc shot <args> --json` as a subprocess, for what sets the worker's own environment: Bun
   * gives a worker the environment dek started in, not process.env as a test changes it.
   */
  const shot = (root: string, args: string[], launch: string) =>
    runDek(["shot", ...args, "--json"], {
      cwd: root,
      env: { DEK_PLAYWRIGHT: sandboxless, DEK_ALLOW_UNSANDBOXED: "", DEK_FAKE_LAUNCH: launch },
    });

  /** `dekc shot <args>` in this process, where dek reads DEK_ALLOW_UNSANDBOXED itself. */
  const shotHere = (root: string, args: string[], allow = "") =>
    withEnv({ DEK_PLAYWRIGHT: sandboxless, DEK_ALLOW_UNSANDBOXED: allow }, () =>
      runMain(["shot", ...args], root),
    );

  test.serial(
    "shoots the project's own deck, says so once on stderr, and records it in --json",
    async () => {
      await withTempProject(project, async (root) => {
        const argv = ["shot", "demo", "intro", "--json"];
        const result = await shotHere(root, argv.slice(1));
        expect(result).toMatchObject({ exitCode: 0 });
        const json = jsonStdout<ShotUnsandboxed>(result);
        expect(contractIssues(printedBy(argv), json)).toEqual([]);
        expect(await Bun.file(json.shots[0]?.path ?? "").exists()).toBe(true);
        expect(json.unsandboxed).toEqual({
          reason: SANDBOX_REASON,
          hint: "run dekc as a user other than root, where Chromium's sandbox can start; or set DEK_ALLOW_UNSANDBOXED=1 to accept drawing without it",
        });
        expect(count(result.stderr, OWN_WARNING)).toBe(1);
      });
    },
  );

  test.serial("says so beside the text output, with how to have the sandbox back", async () => {
    await withTempProject(project, async (root) => {
      const result = await shotHere(root, ["demo", "intro"]);
      expect(result).toMatchObject({ exitCode: 0 });
      expect(result.stdout).toContain(".cache/shots/intro");
      expect(result.stderr).toContain(OWN_WARNING);
      expect(result.stderr).toContain("help: run dekc as a user other than root");
    });
  });

  test.serial(
    "refuses to draw a ref, and leaves drawing it without the sandbox to the user",
    async () => {
      await withTempProject(project, async (root) => {
        const result = await shotHere(root, [REF, "intro", "--json"]);
        expect(result).toMatchObject({ exitCode: 1 });
        const { error } = jsonStdout<Refused>(result);
        expect(error.message).toBe(
          `Chromium did not start with its sandbox here, and a ref is drawn only inside it: ${SANDBOX_REASON}`,
        );
        expect(error.hint).toContain(
          "if you accept running this ref's slide scripts without the sandbox, set DEK_ALLOW_UNSANDBOXED=1",
        );
        expect(result.stderr).not.toContain("warning:");
      });
    },
  );

  test.serial("shoots a ref once DEK_ALLOW_UNSANDBOXED=1, and still says so", async () => {
    await withTempProject(project, async (root) => {
      const result = await shotHere(root, [REF, "intro", "--json"], "1");
      expect(result).toMatchObject({ exitCode: 0 });
      const json = jsonStdout<ShotUnsandboxed>(result);
      expect(await Bun.file(json.shots[0]?.path ?? "").exists()).toBe(true);
      expect(json.unsandboxed?.reason).toBe(SANDBOX_REASON);
      expect(json.unsandboxed?.hint).not.toContain("DEK_ALLOW_UNSANDBOXED");
      expect(count(result.stderr, REF_WARNING)).toBe(1);
    });
  });

  test.serial(
    "DEK_ALLOW_UNSANDBOXED=1 quiets the project's own deck, and --json still records it",
    async () => {
      await withTempProject(project, async (root) => {
        const result = await shotHere(root, ["demo", "intro", "--json"], "1");
        expect(result).toMatchObject({ exitCode: 0 });
        expect(jsonStdout<ShotUnsandboxed>(result).unsandboxed?.reason).toBe(SANDBOX_REASON);
        expect(result.stderr).not.toContain("warning:");
      });
    },
  );

  test("draws the project's own deck after a failure in words dek does not know, and says them", async () => {
    await withTempProject(project, async (root) => {
      const result = await shot(root, ["demo", "intro"], "zygote");
      expect(result).toMatchObject({ exitCode: 0 });
      expect(jsonStdout<ShotUnsandboxed>(result).unsandboxed?.reason).toBe(ZYGOTE_REASON);
      expect(result.stderr).toContain(
        `warning: Chromium drew without its sandbox, which did not start here: ${ZYGOTE_REASON}`,
      );
    });
  });

  test("says what Chromium said when it starts neither way, once when it said the same", async () => {
    await withTempProject(project, async (root) => {
      const result = await shot(root, ["demo", "intro"], "missing");
      expect(result).toMatchObject({ exitCode: 1 });
      const { error } = jsonStdout<Refused>(result);
      expect(error.message).toBe(
        `Chromium did not start, with its sandbox or without: ${CHROMIUM_MISSING}`,
      );
      expect(error.hint).toBe(
        "bun add -d playwright && bunx playwright install chromium or check DEK_PLAYWRIGHT",
      );
      expect(result.stderr).not.toContain("warning:");
    });
  });

  test("reports the second failure, with the first as what Chromium said with its sandbox", async () => {
    await withTempProject(project, async (root) => {
      const { error } = jsonStdout<Refused>(await shot(root, ["demo", "intro"], "both"));
      expect(error.message).toContain(CHROMIUM_MISSING);
      expect(error.hint).toContain(`with it, Chromium said: ${SANDBOX_REASON}`);
      expect(error.hint).not.toContain("chromiumSandbox");
    });
  });
});

describe("shotCommand", () => {
  test("to needs a source slug and refuses step and a bad at", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        const cwd = join(root, "decks", "demo");
        await expect(
          shotCommand(resolveTarget(cwd, "deck", { refs: true }), { to: "intro" }),
        ).rejects.toMatchObject({
          name: "DekError",
          hint: expect.stringContaining("dekc shot [deck] <a> --to <b>"),
        });
        await expect(
          shotCommand(resolveTarget(cwd, "deck", { refs: true }), {
            slug: "intro",
            to: "intro",
            step: "1",
          }),
        ).rejects.toMatchObject({
          name: "DekError",
          hint: expect.stringContaining("--step"),
        });
        await expect(
          shotCommand(resolveTarget(cwd, "deck", { refs: true }), {
            slug: "intro",
            to: "intro",
            at: "2",
          }),
        ).rejects.toMatchObject({
          name: "DekError",
          hint: expect.stringContaining("0 and 1"),
        });
        await expect(
          shotCommand(resolveTarget(cwd, "deck", { refs: true }), { slug: "intro", at: "0.3" }),
        ).rejects.toMatchObject({
          name: "DekError",
          hint: expect.stringContaining("--to"),
        });
      },
    );
  });

  test("--sheet takes the whole deck and --motion one slide, each alone", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        const cwd = join(root, "decks", "demo");
        const target = resolveTarget(cwd, "deck");
        const refused = (options: Parameters<typeof shotCommand>[1], hint: string) =>
          expect(shotCommand(target, options)).rejects.toMatchObject({
            name: "DekError",
            hint: expect.stringContaining(hint),
          });
        await refused({ slug: "intro", sheet: true }, "dekc shot intro --motion");
        await refused({ sheet: true, step: "1" }, "every slide at its last beat");
        await refused({ slug: "intro", sheet: true, to: "intro" }, "--to");
        await refused({ motion: true }, "dekc shot [deck] <slug> --motion");
        await refused({ slug: "intro", motion: true, to: "intro" }, "row 1 of --motion");
        await refused({ slug: "intro", motion: true, at: "0.5" }, "--at");
        await refused({ sheet: true, motion: true }, "one of --sheet and --motion");
      },
    );
  });

  test.serial("hands each mode to its own shot and returns what it made", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        await chmod(fakePlaywright, 0o755);
        const target = resolveTarget(join(root, "decks", "demo"), "deck", { refs: true });
        await withEnv({ DEK_PLAYWRIGHT: fakePlaywright }, async () => {
          const sheet = await shotCommand(target, { sheet: true });
          expect(sheet.shots.map((shot) => shot.slug)).toEqual(["intro"]);
          expect(sheet.sheets).toHaveLength(1);
          expect(sheet.motion).toBeUndefined();

          const morph = await shotCommand(target, { slug: "intro", to: "intro", at: "0.5" });
          expect(morph.shots).toHaveLength(1);
          expect(morph.sheets).toBeUndefined();
        });

        // The shared fake answers no motion; this one answers each beat asked for with no frames.
        const motionWorker = join(root, "motion-worker.ts");
        await writeFile(
          motionWorker,
          `const request = JSON.parse(await new Response(Bun.stdin).text());
process.stdout.write(JSON.stringify({ sheets: [], motion: request.motion.beats.map(({ label }) => ({ label, frames: [] })) }) + "\\n");\n`,
        );
        await withEnv({ DEK_PLAYWRIGHT: motionWorker }, async () => {
          const motion = await shotCommand(target, { slug: "intro", motion: true });
          expect(motion).toEqual({ shots: [], sheets: [], motion: [{ step: "0", frames: [] }] });
        });
      },
    );
  });

  test.serial("fails with a playwright install hint when the runner is missing", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        await withEnv({ DEK_PLAYWRIGHT: "/no/such/playwright" }, async () => {
          try {
            await shotCommand(resolveTarget(join(root, "decks", "demo"), "deck", { refs: true }), {
              slug: "intro",
            });
            throw new Error("expected DekError");
          } catch (error) {
            expect(error).toBeInstanceOf(DekError);
            expect((error as DekError).hint).toContain("playwright install");
          }
        });
      },
    );
  });
});

describe("parseShotMode", () => {
  test("names one mode for the flags, with --at read as a number", () => {
    expect(parseShotMode({})).toEqual({ kind: "still" });
    expect(parseShotMode({ slug: "intro", step: "2" })).toEqual({
      kind: "still",
      slug: "intro",
      step: "2",
    });
    expect(parseShotMode({ sheet: true })).toEqual({ kind: "sheet" });
    expect(parseShotMode({ slug: "intro", motion: true })).toEqual({
      kind: "motion",
      slug: "intro",
    });
    expect(parseShotMode({ slug: "a", to: "b" })).toEqual({
      kind: "morph",
      from: "a",
      to: "b",
      at: 0.5,
    });
    expect(parseShotMode({ slug: "a", to: "b", at: "0.25" })).toMatchObject({ at: 0.25 });
  });

  test("refuses an empty --at instead of reading it as 0", () => {
    for (const at of ["", " "]) {
      expect(() => parseShotMode({ slug: "a", to: "b", at })).toThrow(`invalid --at "${at}"`);
    }
  });

  test("says what --to needs, not the usage twice", () => {
    expect(() => parseShotMode({ to: "intro" })).toThrow(
      expect.objectContaining({
        message: "--to needs the slide it starts from",
        hint: "usage: dekc shot [deck] <a> --to <b> [--at 0..1]; run `dekc help shot`",
      }),
    );
  });
});
