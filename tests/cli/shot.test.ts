import { describe, expect, test } from "bun:test";
import { chmod, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveTarget } from "../../src/cli/scope.ts";
import { parseShotMode, shotCommand } from "../../src/cli/shot.ts";
import { DekError } from "../../src/core/error.ts";
import { jsonStdout, runDek } from "../helpers/cli.ts";
import { withEnv } from "../helpers/env.ts";
import { slideDocument } from "../helpers/html.ts";
import { withTempProject } from "../helpers/project.ts";

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
