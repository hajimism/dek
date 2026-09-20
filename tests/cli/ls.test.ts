import { describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { lsCommand } from "../../src/cli/ls.ts";
import { jsonStdout, runDek } from "../helpers/cli.ts";
import { slideDocument } from "../helpers/html.ts";
import { withTempProject } from "../helpers/project.ts";

const introHtml = slideDocument(`<section class="slide" data-layout="title">
  <h2 class="slide-title">intro</h2>
</section>`);

type LsListOk = {
  ok: true;
  root: string;
  decks: Array<{
    name: string;
    title: string;
    sections: number;
    slides: number;
    diagnostics: unknown[];
  }>;
  failed?: Array<{ name: string }>;
};

describe("dek ls", () => {
  test("lists decks from the project root", async () => {
    await withTempProject(
      {
        decks: [{ name: "demo", slides: { intro: introHtml } }],
      },
      async (root) => {
        const result = await runDek(["ls", "--json"], { cwd: root });
        expect(result.exitCode).toBe(0);
        const json = jsonStdout<LsListOk>(result);
        expect(json.ok).toBe(true);
        expect(json.root).toBe(root);
        expect(json.decks).toHaveLength(1);
        expect(json.decks[0]?.name).toBe("demo");
        expect(json.decks[0]?.title).toBe("Demo");
        expect(json.decks[0]?.sections).toBe(1);
        expect(json.decks[0]?.slides).toBe(1);
        expect(json.decks[0]?.diagnostics).toEqual([]);
        expect("kind" in json).toBe(false);
      },
    );
  });
});

describe("lsCommand", () => {
  test("includes decks that failed to load", async () => {
    await withTempProject(
      {
        decks: [{ name: "demo", slides: { intro: introHtml } }],
      },
      async (root) => {
        await mkdir(join(root, "decks", "orphan"), { recursive: true });
        const result = lsCommand({ cwd: root });
        if (result.kind !== "list") {
          throw new Error("expected list");
        }
        expect(result.decks.map((deck) => deck.name)).toEqual(["demo"]);
        expect(result.failed).toEqual([{ name: "orphan" }]);
      },
    );
  });

  test("shows one deck by name", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            script: `---
title: Demo
---

## intro

hello

## architecture

### hook {#hook}

body
`,
            slides: { intro: introHtml },
          },
        ],
      },
      async (root) => {
        const result = lsCommand({ cwd: root, deck: "demo" });
        if (result.kind !== "deck") {
          throw new Error("expected deck");
        }
        expect(result.name).toBe("demo");
        expect(result.title).toBe("Demo");
        expect(result.sections).toMatchObject([
          { slug: "intro", title: "intro", beats: 0 },
          { slug: "architecture", title: "architecture", beats: 1 },
        ]);
      },
    );
  });

  test("scopes to the current deck directory", async () => {
    await withTempProject(
      {
        decks: [{ name: "demo", slides: { intro: introHtml } }],
      },
      async (root) => {
        const result = lsCommand({ cwd: join(root, "decks", "demo") });
        if (result.kind !== "deck") {
          throw new Error("expected deck");
        }
        expect(result.name).toBe("demo");
        expect(result.sections[0]?.slug).toBe("intro");
      },
    );
  });

  test("scopes with --deck", async () => {
    await withTempProject(
      {
        decks: [{ name: "demo", slides: { intro: introHtml } }],
      },
      async (root) => {
        const result = lsCommand({ cwd: root, deck: "demo" });
        if (result.kind !== "deck") {
          throw new Error("expected deck");
        }
        expect(result.name).toBe("demo");
      },
    );
  });

  test("estimates CJK at 300 chars/min and latin at 130 words/min", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            script: `---
title: Demo
---

## intro

あいうえお

## architecture

a b c d e f g h i j k l m
`,
            slides: { intro: introHtml },
          },
        ],
      },
      async (root) => {
        const result = lsCommand({ cwd: root, deck: "demo" });
        if (result.kind !== "deck") {
          throw new Error("expected deck");
        }
        expect(result.duration).toBeUndefined();
        expect(result.estimateSeconds).toBe(7);
        expect(result.sections[0]).toMatchObject({ slug: "intro", estimateSeconds: 1 });
        expect(result.sections[1]).toMatchObject({ slug: "architecture", estimateSeconds: 6 });
        expect(result.sections[0]?.budgetSeconds).toBeUndefined();
        expect(result.sections[1]?.budgetSeconds).toBeUndefined();
      },
    );
  });

  test("ignores blockquotes and splits duration by character count", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            script: `---
title: Demo
duration: 10m
---

## intro

あいうえお

> これは数えない

## architecture

かきくけこさしすせそ
`,
            slides: { intro: introHtml },
          },
        ],
      },
      async (root) => {
        const result = lsCommand({ cwd: root, deck: "demo" });
        if (result.kind !== "deck") {
          throw new Error("expected deck");
        }
        expect(result.duration).toBe("10m");
        expect(result.estimateSeconds).toBe(3);
        expect(result.sections[0]).toMatchObject({
          slug: "intro",
          estimateSeconds: 1,
          budgetSeconds: 200,
        });
        expect(result.sections[1]).toMatchObject({
          slug: "architecture",
          estimateSeconds: 2,
          budgetSeconds: 400,
        });
      },
    );
  });

  test("uses cjk_per_minute and latin_per_minute from dek.toml", async () => {
    await withTempProject(
      {
        toml: "cjk_per_minute = 5\nlatin_per_minute = 13\n",
        decks: [
          {
            name: "demo",
            script: `---
title: Demo
---

## intro

あいうえお

## architecture

a b c d e f g h i j k l m
`,
            slides: { intro: introHtml },
          },
        ],
      },
      async (root) => {
        const result = lsCommand({ cwd: root, deck: "demo" });
        if (result.kind !== "deck") {
          throw new Error("expected deck");
        }
        expect(result.estimateSeconds).toBe(120);
        expect(result.sections[0]?.estimateSeconds).toBe(60);
        expect(result.sections[1]?.estimateSeconds).toBe(60);
      },
    );
  });

  test("places Timeline duration next to the estimate", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            script: `---
title: Demo
---

## intro

hello

## architecture

body
`,
            slides: { intro: introHtml },
          },
        ],
      },
      async (root) => {
        await mkdir(join(root, "decks", "demo", ".cache", "voice"), { recursive: true });
        await writeFile(
          join(root, "decks", "demo", ".cache", "voice", "timeline.json"),
          JSON.stringify({
            audio: "",
            durationMs: 8000,
            beats: [
              {
                position: { slideIndex: 0, beatIndex: 0 },
                start: 0,
                end: 3000,
                sentences: [],
              },
              {
                position: { slideIndex: 1, beatIndex: 0 },
                start: 3700,
                end: 8000,
                sentences: [],
              },
            ],
          }),
        );
        const result = lsCommand({ cwd: root, deck: "demo" });
        if (result.kind !== "deck") {
          throw new Error("expected deck");
        }
        expect(result.videoSeconds).toBe(8);
        expect(result.sections[0]?.videoSeconds).toBe(4);
        expect(result.sections[1]?.videoSeconds).toBe(4);
      },
    );
  });

  test("includes event and date", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            script: `---
title: Demo
event: Tokyo Frontend Meetup #42
date: 2026-04-18
duration: 20m
---

## intro

hello
`,
            slides: { intro: introHtml },
          },
        ],
      },
      async (root) => {
        const result = lsCommand({ cwd: root, deck: "demo" });
        if (result.kind !== "deck") {
          throw new Error("expected deck");
        }
        expect(result.event).toBe("Tokyo Frontend Meetup #42");
        expect(result.date).toBe("2026-04-18");
        expect(result.duration).toBe("20m");
      },
    );
  });
});
