import { describe, expect, test } from "bun:test";
import { mkdtemp, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { DekError } from "../../src/core/error.ts";
import type { VisualRequest } from "../../src/core/playwright.ts";
import { resolveDeck } from "../../src/core/resolve.ts";
import { shotMorph } from "../../src/core/shot/morph.ts";
import { planMotion, shotMotion } from "../../src/core/shot/motion.ts";
import { coverShot, shotDeck, shotSheet } from "../../src/core/shot/still.ts";
import { shotName } from "../../src/core/shot-cache.ts";
import { slideDocument } from "../helpers/html.ts";
import { withTempProject } from "../helpers/project.ts";
import { pagesOf, writeRequested } from "../helpers/visual.ts";

const introHtml = slideDocument(`<section class="slide" data-layout="title">
  <h2 class="slide-title">intro</h2>
</section>`);

const architectureHtml = slideDocument(`<section class="slide" data-layout="title">
  <h2 class="slide-title">architecture</h2>
</section>`);

const twoSlideScript = `---
title: Demo
---

## intro

hello

## architecture

body
`;

describe("shotDeck", () => {
  test("captures every slide in one runner call", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            script: twoSlideScript,
            slides: { intro: introHtml, architecture: architectureHtml },
          },
        ],
      },
      async (root) => {
        let calls = 0;
        const shots = await shotDeck(join(root, "decks", "demo"), {
          runner: async (request: VisualRequest) => {
            calls += 1;
            // A page is shot for naming a screenshotPath; no action measures it.
            expect(request).toMatchObject({ kind: "pages", actions: [] });
            expect(pagesOf(request)).toHaveLength(2);
            expect(pagesOf(request).every((page) => page.screenshotPath)).toBe(true);
            await writeRequested(request);
            return { overflows: [], contrasts: [] };
          },
        });
        expect(calls).toBe(1);
        expect(shots.map((shot) => shot.slug)).toEqual(["intro", "architecture"]);
        expect(shots[0]?.path).toMatch(/\/\.cache\/shots\/intro~0\.[0-9a-f]{8}\.png$/);
      },
    );
  });

  test("shots a parsed deck without re-reading script.md", async () => {
    await withTempProject(
      {
        decks: [{ name: "demo", slides: { intro: introHtml } }],
      },
      async (root) => {
        const resolved = resolveDeck(join(root, "decks", "demo"));
        await writeFile(join(root, "decks", "demo", "script.md"), "this is not a deck\n");
        const runner = async (request: VisualRequest) => {
          await writeRequested(request);
          return { overflows: [], contrasts: [] };
        };
        await expect(shotDeck(resolved.deck.dir, { runner })).rejects.toThrow(DekError);
        const shots = await shotDeck(resolved, { runner });
        expect(shots.map((shot) => shot.slug)).toEqual(["intro"]);
      },
    );
  });

  test("rejects a numeric step that does not exist on a title slide", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        await expect(
          shotDeck(join(root, "decks", "demo"), {
            slug: "intro",
            step: "2",
            runner: async () => ({ overflows: [], contrasts: [] }),
          }),
        ).rejects.toMatchObject({
          name: "DekError",
          message: 'step "2" not found in "intro"',
          hint: "this slide has no beats; use 0, or leave out --step",
        });
      },
    );
  });

  test("names the beats a missing step could have been", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            script: "---\ntitle: Demo\n---\n\n## intro\n\n### hook\n\na\n\n### turn\n\nb\n",
            slides: { intro: introHtml },
          },
        ],
      },
      async (root) => {
        await expect(
          shotDeck(join(root, "decks", "demo"), {
            slug: "intro",
            step: "nope",
            runner: async () => ({ overflows: [], contrasts: [] }),
          }),
        ).rejects.toMatchObject({ hint: "use hook, turn, or 0-2" });
      },
    );
  });

  test("accepts step 0, the arrival, on a title slide with no beats", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        const shots = await shotDeck(join(root, "decks", "demo"), {
          slug: "intro",
          step: "0",
          runner: async (request) => {
            expect(pagesOf(request)).toHaveLength(1);
            await writeRequested(request);
            return { overflows: [], contrasts: [] };
          },
        });
        expect(shots).toHaveLength(1);
        expect(shots[0]).toMatchObject({ slug: "intro", step: "0" });
        expect(shots[0]?.path).toMatch(/\/\.cache\/shots\/intro~0\.[0-9a-f]{8}\.png$/);
      },
    );
  });

  test("changes the path when theme.css changes and removes the stale file", async () => {
    await withTempProject(
      {
        decks: [{ name: "demo", slides: { intro: introHtml }, theme: ".slide { --fg: #fff; }\n" }],
      },
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        const runner = async (request: VisualRequest) => {
          await writeRequested(request);
          return { overflows: [], contrasts: [] };
        };
        const before = await shotDeck(deckDir, { slug: "intro", runner });
        const again = await shotDeck(deckDir, { slug: "intro", runner });
        expect(again[0]?.path).toBe(before[0]?.path);

        await writeFile(join(deckDir, "theme.css"), ".slide { --fg: #000; }\n");
        const after = await shotDeck(deckDir, { slug: "intro", runner });
        expect(after[0]?.path).not.toBe(before[0]?.path);
        expect(await Bun.file(after[0]?.path ?? "").exists()).toBe(true);
        expect(await Bun.file(before[0]?.path ?? "").exists()).toBe(false);
        const names = await readdir(join(deckDir, ".cache", "shots"));
        expect(names.filter((name) => name.startsWith("intro~"))).toHaveLength(1);
      },
    );
  });

  test("shoots only the slides whose rendering changed since their last shot", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            script: twoSlideScript,
            slides: { intro: introHtml, architecture: architectureHtml },
          },
        ],
      },
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        const shotSlugs: string[][] = [];
        const runner = async (request: VisualRequest) => {
          shotSlugs.push(pagesOf(request).map((page) => page.slug));
          await writeRequested(request);
          return { overflows: [], contrasts: [] };
        };
        const first = await shotDeck(deckDir, { runner });
        await writeFile(
          join(deckDir, "slides", "architecture.html"),
          architectureHtml.replace("architecture</h2>", "the architecture</h2>"),
        );
        const second = await shotDeck(deckDir, { runner });
        expect(shotSlugs).toEqual([["intro", "architecture"], ["architecture"]]);
        expect(second.map((shot) => shot.slug)).toEqual(["intro", "architecture"]);
        expect(second[0]?.path).toBe(first[0]?.path);
      },
    );
  });

  test("needs no browser when every shot is already on disk", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        const [shot] = await shotDeck(deckDir, {
          runner: async (request) => {
            await writeRequested(request);
            return { overflows: [], contrasts: [] };
          },
        });
        // A runner that answers null is one without Playwright.
        const again = await shotDeck(deckDir, { runner: async () => null });
        expect(again).toEqual([{ slug: "intro", step: "0", path: shot?.path ?? "" }]);
      },
    );
  });

  test("removes a legacy intro.png when it shoots the same slide", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        const legacy = join(deckDir, ".cache", "shots", "intro.png");
        await Bun.write(legacy, "");
        await shotDeck(deckDir, {
          slug: "intro",
          runner: async (request) => {
            await writeRequested(request);
            return { overflows: [], contrasts: [] };
          },
        });
        expect(await Bun.file(legacy).exists()).toBe(false);
      },
    );
  });
});

describe("shotName", () => {
  test("hashes what the page renders and keeps the slug and step readable", () => {
    const a = shotName(["intro", "0"], "<html>a</html>");
    expect(a).toMatch(/^intro~0\.[0-9a-f]{8}\.png$/);
    expect(shotName(["intro", "0"], "<html>a</html>")).toBe(a);
    expect(shotName(["intro", "0"], "<html>b</html>")).not.toBe(a);
    expect(shotName(["intro", "hook"], "<html>a</html>")).toMatch(/^intro~hook\.[0-9a-f]{8}\.png$/);
  });
});

describe("shotMorph", () => {
  const morphScript = `---
title: Demo
---

## problem

### one {#one}

first

### two {#two}

second

## architecture

body
`;
  const problemHtml = slideDocument(`<section class="slide" data-layout="default">
  <h2 class="slide-title">problem</h2>
  <p class="node" data-morph="pipeline" data-step="one">a</p>
  <p class="node" data-step="two">b</p>
</section>`);
  const morphedHtml = slideDocument(`<section class="slide" data-layout="title">
  <p class="node node-parent" data-morph="pipeline">a</p>
</section>`);

  test("asks the runner for one morph frame between the last beat of a and beat 0 of b", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            script: morphScript,
            slides: { problem: problemHtml, architecture: morphedHtml },
          },
        ],
      },
      async (root) => {
        const requests: VisualRequest[] = [];
        const shots = await shotMorph(join(root, "decks", "demo"), {
          from: "problem",
          to: "architecture",
          at: 0.5,
          playerScript: "/* player */",
          runner: async (request) => {
            requests.push(request);
            await writeRequested(request);
            return { overflows: [], contrasts: [] };
          },
        });
        expect(requests).toHaveLength(1);
        const request = requests[0];
        expect(request?.kind).toBe("morph");
        expect(request?.kind === "morph" && request.morph).toEqual({
          from: { slideIndex: 0, beatIndex: 2 },
          to: { slideIndex: 1, beatIndex: 0 },
          at: 0.5,
        });
        const html = request?.kind === "morph" ? request.html : "";
        expect(html).toContain('data-slug="problem"');
        expect(html).toContain('data-slug="architecture"');
        expect(html).toContain("/* player */");
        expect(request?.kind === "morph" && request.screenshotPath).toBe(shots[0]?.path ?? "");
        expect(shots).toHaveLength(1);
        expect(shots[0]).toMatchObject({ slug: "problem", to: "architecture", at: 0.5 });
        expect(shots[0]?.path).toMatch(
          /\/\.cache\/shots\/problem~architecture~0\.5\.[0-9a-f]{8}\.png$/,
        );
        expect(await Bun.file(shots[0]?.path ?? "").exists()).toBe(true);
      },
    );
  });

  test("takes a frame once, and again only at another --at", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            script: morphScript,
            slides: { problem: problemHtml, architecture: morphedHtml },
          },
        ],
      },
      async (root) => {
        const taken: number[] = [];
        const shoot = (at: number) =>
          shotMorph(join(root, "decks", "demo"), {
            from: "problem",
            to: "architecture",
            at,
            playerScript: "/* player */",
            runner: async (request) => {
              taken.push(request.kind === "morph" ? request.morph.at : -1);
              await writeRequested(request);
              return { overflows: [], contrasts: [] };
            },
          });
        const [first] = await shoot(0.5);
        const [again] = await shoot(0.5);
        await shoot(0.25);
        expect(taken).toEqual([0.5, 0.25]);
        expect(again?.path).toBe(first?.path ?? "");
      },
    );
  });

  test("rejects an unknown target slug and an --at outside 0..1", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            script: morphScript,
            slides: { problem: problemHtml, architecture: morphedHtml },
          },
        ],
      },
      async (root) => {
        const runner = async () => ({ overflows: [], contrasts: [] });
        const deckDir = join(root, "decks", "demo");
        await expect(
          shotMorph(deckDir, { from: "problem", to: "nope", at: 0.5, playerScript: "", runner }),
        ).rejects.toMatchObject({ name: "DekError", message: 'section "nope" not found' });
        await expect(
          shotMorph(deckDir, {
            from: "problem",
            to: "architecture",
            at: 1.5,
            playerScript: "",
            runner,
          }),
        ).rejects.toMatchObject({ name: "DekError", message: expect.stringContaining("--at") });
      },
    );
  });
});

/** A runner that writes every file the request names, as the worker would, and records it. */
function writingRunner(requests: VisualRequest[]) {
  return async (request: VisualRequest) => {
    requests.push(request);
    await writeRequested(request, "png");
    const spec = request.kind === "motion" ? request.motion : undefined;
    const motion = spec?.beats.map((beat, i) => ({
      label: beat.label,
      frames: [{ ms: 0, path: join(spec.dir, `frames/${i + 1}-end.png`), end: true as const }],
    }));
    for (const frame of motion?.flatMap((beat) => beat.frames) ?? []) {
      await Bun.write(frame.path, "png");
    }
    const sheets = sheetsOf(request)?.map((sheet) => sheet.path) ?? [];
    if (spec) {
      sheets.push(join(spec.dir, "sheet-1.png"));
    }
    for (const path of sheets) {
      await Bun.write(path, "png");
    }
    return motion ? { motion, sheets } : { overflows: [], contrasts: [] };
  };
}

function sheetsOf(request: VisualRequest | undefined) {
  return request?.kind === "pages" ? request.sheets : undefined;
}

function motionOf(request: VisualRequest | undefined) {
  return request?.kind === "motion" ? request.motion : undefined;
}

describe("shotSheet", () => {
  const deck = {
    decks: [
      {
        name: "demo",
        script: twoSlideScript,
        slides: { intro: introHtml, architecture: architectureHtml },
      },
    ],
  };

  test("tiles every slide at its last beat, in order, in the same call that shoots them", async () => {
    await withTempProject(deck, async (root) => {
      const requests: VisualRequest[] = [];
      const result = await shotSheet(join(root, "decks", "demo"), {
        runner: writingRunner(requests),
      });
      expect(requests).toHaveLength(1);
      expect(pagesOf(requests[0]).map((page) => page.slug)).toEqual(["intro", "architecture"]);
      const [sheet] = sheetsOf(requests[0]) ?? [];
      expect(sheet?.rows.flatMap((row) => row.cells)).toEqual(
        result.shots.map((shot, i) => ({ image: shot.path, label: `${i + 1} · ${shot.slug}` })),
      );
      expect(sheet?.title).toBe("Demo · slides 1–2 of 2");
      expect(result.sheets).toHaveLength(1);
      expect(result.sheets[0]).toMatch(/\/\.cache\/shots\/sheets\/[0-9a-f]{8}\/sheet-1\.png$/);
    });
  });

  test("starts no browser when neither a slide nor the sheet changed", async () => {
    await withTempProject(deck, async (root) => {
      const requests: VisualRequest[] = [];
      const first = await shotSheet(join(root, "decks", "demo"), {
        runner: writingRunner(requests),
      });
      const again = await shotSheet(join(root, "decks", "demo"), {
        runner: writingRunner(requests),
      });
      expect(requests).toHaveLength(1);
      expect(again).toEqual(first);
    });
  });

  test("shoots only the slide that changed, and draws a new sheet in place of the old", async () => {
    await withTempProject(deck, async (root) => {
      const dir = join(root, "decks", "demo");
      const requests: VisualRequest[] = [];
      const first = await shotSheet(dir, { runner: writingRunner(requests) });
      await writeFile(
        join(dir, "slides", "architecture.html"),
        introHtml.replace("intro", "changed"),
      );
      const again = await shotSheet(dir, { runner: writingRunner(requests) });
      expect(pagesOf(requests[1]).map((page) => page.slug)).toEqual(["architecture"]);
      expect(sheetsOf(requests[1])?.[0]?.rows.flatMap((row) => row.cells)).toHaveLength(2);
      expect(again.sheets[0]).not.toBe(first.sheets[0]);
      expect(await readdir(join(dir, ".cache", "shots", "sheets"))).toHaveLength(1);
    });
  });

  test("refuses a sheet folder that links out of the project", async () => {
    await withTempProject(deck, async (root) => {
      const dir = join(root, "decks", "demo");
      const outside = await mkdtemp(join(tmpdir(), "dek-outside-"));
      try {
        const first = await shotSheet(dir, { runner: writingRunner([]) });
        const sheetDir = dirname(first.sheets[0] ?? "");
        await rm(sheetDir, { recursive: true });
        await symlink(outside, sheetDir);
        await expect(shotSheet(dir, { runner: writingRunner([]) })).rejects.toThrow(
          "leads outside the project",
        );
        expect(await readdir(outside)).toEqual([]);
      } finally {
        await rm(outside, { recursive: true, force: true });
      }
    });
  });
});

describe("shotMotion", () => {
  const script = `---
title: Demo
---

## intro

hello

## timing

### draw {#draw}

first

### label

second
`;
  const timingHtml = slideDocument(`<section class="slide">
  <h2 class="slide-title">timing</h2>
</section>`);
  const deck = {
    decks: [{ name: "demo", script, slides: { intro: introHtml, timing: timingHtml } }],
  };

  test("plays every beat of the slide, starting from the slide before it", async () => {
    await withTempProject(deck, async (root) => {
      const requests: VisualRequest[] = [];
      const result = await shotMotion(join(root, "decks", "demo"), {
        slug: "timing",
        playerScript: "/* player */",
        runner: writingRunner(requests),
      });
      const [request] = requests;
      expect(request?.kind).toBe("motion");
      expect(request?.kind === "motion" && request.html).toContain("/* player */");
      expect(motionOf(request)?.from).toEqual({ slideIndex: 0, beatIndex: 0 });
      expect(motionOf(request)?.beats).toEqual([
        { position: { slideIndex: 1, beatIndex: 0 }, label: "arrival · from intro" },
        { position: { slideIndex: 1, beatIndex: 1 }, label: "beat 1 · draw" },
        { position: { slideIndex: 1, beatIndex: 2 }, label: "beat 2 · label" },
      ]);
      expect(motionOf(request)?.fractions).toEqual([0, 0.25, 0.5, 0.75]);
      expect(motionOf(request)?.title).toBe("timing · motion");
      expect(result.beats.map((beat) => beat.step)).toEqual(["0", "draw", "label"]);
      expect(result.sheets).toHaveLength(1);
      expect(result.sheets[0]).toMatch(
        /\/\.cache\/shots\/motion\/timing\.[0-9a-f]{8}\/sheet-1\.png$/,
      );
    });
  });

  test("with a step, plays that beat alone, from the beat before it", async () => {
    await withTempProject(deck, async (root) => {
      const requests: VisualRequest[] = [];
      await shotMotion(join(root, "decks", "demo"), {
        slug: "timing",
        step: "2",
        playerScript: "/* player */",
        runner: writingRunner(requests),
      });
      expect(motionOf(requests[0])?.from).toEqual({ slideIndex: 1, beatIndex: 1 });
      expect(motionOf(requests[0])?.beats).toEqual([
        { position: { slideIndex: 1, beatIndex: 2 }, label: "beat 2 · label · from beat 1" },
      ]);
    });
  });

  test("plays the first slide from the start of the talk", async () => {
    await withTempProject(deck, async (root) => {
      const requests: VisualRequest[] = [];
      await shotMotion(join(root, "decks", "demo"), {
        slug: "intro",
        playerScript: "/* player */",
        runner: writingRunner(requests),
      });
      expect(motionOf(requests[0])?.from).toBeUndefined();
      expect(motionOf(requests[0])?.beats).toEqual([
        { position: { slideIndex: 0, beatIndex: 0 }, label: "arrival · from the start" },
      ]);
    });
  });

  test("answers from the cache while the deck is unchanged", async () => {
    await withTempProject(deck, async (root) => {
      const requests: VisualRequest[] = [];
      const options = {
        slug: "timing",
        playerScript: "/* player */",
        runner: writingRunner(requests),
      };
      const first = await shotMotion(join(root, "decks", "demo"), options);
      const again = await shotMotion(join(root, "decks", "demo"), options);
      expect(requests).toHaveLength(1);
      expect(again).toEqual(first);
    });
  });

  test("fails, and caches nothing, when the worker answers for other beats", async () => {
    await withTempProject(deck, async (root) => {
      const options = {
        slug: "timing",
        playerScript: "/* player */",
        runner: async () => ({ motion: [], sheets: [] }),
      };
      await expect(shotMotion(join(root, "decks", "demo"), options)).rejects.toThrow(
        "the Playwright worker returned the wrong number of beats",
      );
      const requests: VisualRequest[] = [];
      await shotMotion(join(root, "decks", "demo"), {
        ...options,
        runner: writingRunner(requests),
      });
      expect(requests).toHaveLength(1);
    });
  });

  test("keeps the cache of each step, so runs of different steps don't evict each other", async () => {
    await withTempProject(deck, async (root) => {
      const dir = join(root, "decks", "demo");
      const requests: VisualRequest[] = [];
      const run = (step?: string) =>
        shotMotion(dir, {
          slug: "timing",
          ...(step ? { step } : {}),
          playerScript: "/* player */",
          runner: writingRunner(requests),
        });
      await run();
      await run("draw");
      await run();
      await run("draw");
      expect(requests).toHaveLength(2);
    });
  });

  test("refuses a cache folder that links out of the project, and writes nothing there", async () => {
    await withTempProject(deck, async (root) => {
      const dir = join(root, "decks", "demo");
      const outside = await mkdtemp(join(tmpdir(), "dek-outside-"));
      try {
        const options = { slug: "timing", playerScript: "/* player */" };
        const first = await shotMotion(dir, { ...options, runner: writingRunner([]) });
        const motionDir = dirname(first.sheets[0] ?? "");
        await rm(motionDir, { recursive: true });
        await symlink(outside, motionDir);
        const requests: VisualRequest[] = [];
        await expect(
          shotMotion(dir, { ...options, runner: writingRunner(requests) }),
        ).rejects.toThrow("leads outside the project");
        expect(requests).toHaveLength(0);
        expect(await readdir(outside)).toEqual([]);
      } finally {
        await rm(outside, { recursive: true, force: true });
      }
    });
  });

  test("trusts no path a manifest names outside its own folder, and removes nothing there", async () => {
    await withTempProject(deck, async (root) => {
      const dir = join(root, "decks", "demo");
      const outside = await mkdtemp(join(tmpdir(), "dek-outside-"));
      try {
        const options = { slug: "timing", playerScript: "/* player */" };
        const first = await shotMotion(dir, { ...options, runner: writingRunner([]) });
        const motionDir = dirname(first.sheets[0] ?? "");
        const victim = join(outside, "victim-link");
        await symlink(join(outside, "target"), victim);
        await writeFile(
          join(motionDir, "motion.json"),
          JSON.stringify({ ...first, sheets: [...first.sheets, victim] }),
        );
        const requests: VisualRequest[] = [];
        const again = await shotMotion(dir, { ...options, runner: writingRunner(requests) });
        expect(requests).toHaveLength(1);
        expect(again.sheets).not.toContain(victim);
        expect(await readdir(outside)).toEqual([basename(victim)]);
      } finally {
        await rm(outside, { recursive: true, force: true });
      }
    });
  });

  test("says how to install Playwright when it is missing", async () => {
    await withTempProject(deck, async (root) => {
      await expect(
        shotMotion(join(root, "decks", "demo"), {
          slug: "timing",
          playerScript: "/* player */",
          runner: async () => null,
        }),
      ).rejects.toThrow("Playwright is not installed");
    });
  });
});

describe("the still cache", () => {
  /** Writes each still the request names, as the worker would. */
  const stillRunner = async (request: VisualRequest) => {
    await writeRequested(request, "png");
    return { overflows: [], contrasts: [] };
  };

  test("keeps slug a at step b apart from slug a-b, so neither prunes the other", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            script: "---\ntitle: Demo\n---\n\n## a\n\n### b {#b}\n\nx\n\n## a-b\n\ny\n",
            slides: { a: introHtml, "a-b": architectureHtml },
          },
        ],
      },
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        const [stepped] = await shotDeck(deckDir, { slug: "a", step: "b", runner: stillRunner });
        const [plain] = await shotDeck(deckDir, { slug: "a-b", runner: stillRunner });
        expect(stepped?.path).not.toBe(plain?.path);
        expect(await Bun.file(stepped?.path ?? "").exists()).toBe(true);
        expect(await Bun.file(plain?.path ?? "").exists()).toBe(true);
      },
    );
  });

  test("names a step by its beat, however it was asked for", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            script: "---\ntitle: Demo\n---\n\n## intro\n\n### hook {#hook}\n\nx\n",
            slides: { intro: introHtml },
          },
        ],
      },
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        const [byId] = await shotDeck(deckDir, {
          slug: "intro",
          step: "hook",
          runner: stillRunner,
        });
        const [byNumber] = await shotDeck(deckDir, {
          slug: "intro",
          step: "1",
          runner: async () => null,
        });
        const [last] = await shotDeck(deckDir, { slug: "intro", runner: async () => null });
        expect(byId?.path).toMatch(/\/\.cache\/shots\/intro~hook\.[0-9a-f]{8}\.png$/);
        expect(byNumber?.path).toBe(byId?.path ?? "");
        expect(last?.path).toBe(byId?.path ?? "");
        // What the caller asked for is still what the result says.
        expect([byId?.step, byNumber?.step, last?.step]).toEqual(["hook", "1", "hook"]);
      },
    );
  });

  test("lets dek shot reuse the still dek build took for the link preview", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        const cover = await coverShot(resolveDeck(deckDir).deck, stillRunner);
        const [shot] = await shotDeck(deckDir, { runner: async () => null });
        expect(shot?.path).toBe(cover ?? "");
      },
    );
  });

  test("keeps the last good still when a run fails or finds no Playwright", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        const [good] = await shotDeck(deckDir, { runner: stillRunner });
        await writeFile(join(deckDir, "slides", "intro.html"), introHtml.replace("intro<", "x<"));
        await expect(shotDeck(deckDir, { runner: async () => null })).rejects.toThrow(
          "Playwright is not installed",
        );
        await expect(
          shotDeck(deckDir, {
            runner: async () => {
              throw new Error("chromium crashed");
            },
          }),
        ).rejects.toThrow("chromium crashed");
        expect(await Bun.file(good?.path ?? "").exists()).toBe(true);
        const [next] = await shotDeck(deckDir, { runner: stillRunner });
        expect(await Bun.file(good?.path ?? "").exists()).toBe(false);
        expect(await Bun.file(next?.path ?? "").exists()).toBe(true);
      },
    );
  });

  test("removes the legacy names of the same slide and step", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            script: "---\ntitle: Demo\n---\n\n## intro\n\n### hook {#hook}\n\nx\n",
            slides: { intro: introHtml },
          },
        ],
      },
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        const shots = join(deckDir, ".cache", "shots");
        const legacy = ["intro.png", "intro.0123abcd.png", "intro-hook.0123abcd.png"];
        for (const name of legacy) {
          await Bun.write(join(shots, name), "");
        }
        // Another slide's legacy still is not this one's to remove.
        await Bun.write(join(shots, "outro.0123abcd.png"), "");
        await shotDeck(deckDir, { runner: stillRunner });
        const names = await readdir(shots);
        expect(names.filter((name) => legacy.includes(name))).toEqual([]);
        expect(names).toContain("outro.0123abcd.png");
      },
    );
  });

  test("keeps morph frames of different slide pairs apart", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            script:
              "---\ntitle: Demo\n---\n\n## a\n\nx\n\n## b-to-c\n\ny\n\n## a-to-b\n\nz\n\n## c\n\nw\n",
            slides: { a: introHtml, "b-to-c": introHtml, "a-to-b": introHtml, c: introHtml },
          },
        ],
      },
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        const morph = (from: string, to: string) =>
          shotMorph(deckDir, { from, to, at: 0.5, playerScript: "", runner: stillRunner });
        const [one] = await morph("a", "b-to-c");
        const [two] = await morph("a-to-b", "c");
        expect(one?.path).toMatch(/\/a~b-to-c~0\.5\.[0-9a-f]{8}\.png$/);
        expect(one?.path).not.toBe(two?.path);
        expect(await Bun.file(one?.path ?? "").exists()).toBe(true);
      },
    );
  });
});

describe("planMotion", () => {
  const section = (slug: string, beats: Array<{ id?: string }>) =>
    ({ slug, title: slug, beats }) as unknown as Parameters<typeof planMotion>[0];
  const intro = section("intro", [{}]);
  const timing = section("timing", [{ id: "draw" }, {}]);
  const sections = [intro, timing];

  test("plays every beat, from the previous slide's last beat", () => {
    expect(planMotion(timing, sections)).toEqual({
      from: { slideIndex: 0, beatIndex: 1 },
      beats: [
        { position: { slideIndex: 1, beatIndex: 0 }, label: "arrival · from intro", step: "0" },
        { position: { slideIndex: 1, beatIndex: 1 }, label: "beat 1 · draw", step: "draw" },
        { position: { slideIndex: 1, beatIndex: 2 }, label: "beat 2", step: "2" },
      ],
    });
  });

  test("plays one beat from the beat before it, or from the arrival", () => {
    expect(planMotion(timing, sections, "2")).toEqual({
      from: { slideIndex: 1, beatIndex: 1 },
      beats: [
        { position: { slideIndex: 1, beatIndex: 2 }, label: "beat 2 · from beat 1", step: "2" },
      ],
    });
    expect(planMotion(timing, sections, "draw").beats[0]?.label).toBe(
      "beat 1 · draw · from arrival",
    );
  });

  test("starts the first slide from nowhere", () => {
    expect(planMotion(intro, sections, "0")).toEqual({
      beats: [
        {
          position: { slideIndex: 0, beatIndex: 0 },
          label: "arrival · from the start",
          step: "0",
        },
      ],
    });
  });

  test("names the steps a missing one could have been", () => {
    expect(() => planMotion(timing, sections, "nope")).toThrow('step "nope" not found');
  });
});

describe("the motion cache", () => {
  test("keeps the last good capture when a run fails", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        const dir = join(root, "decks", "demo");
        const options = { slug: "intro", playerScript: "/* player */" };
        const first = await shotMotion(dir, { ...options, runner: writingRunner([]) });
        await expect(
          shotMotion(dir, { ...options, playerScript: "/* changed */", runner: async () => null }),
        ).rejects.toThrow("Playwright is not installed");
        expect(await Bun.file(first.sheets[0] ?? "").exists()).toBe(true);
        await shotMotion(dir, {
          ...options,
          playerScript: "/* changed */",
          runner: writingRunner([]),
        });
        expect(await readdir(join(dir, ".cache", "shots", "motion"))).toHaveLength(1);
      },
    );
  });
});
