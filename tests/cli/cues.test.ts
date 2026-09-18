import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { jsonStdout, runDek } from "../helpers/cli.ts";
import { withTempProject } from "../helpers/project.ts";

type CuesOk = {
  ok: true;
  name: string;
  cues: Array<{
    position: { slideIndex: number; beatIndex: number };
    slug: string;
    line: number;
    paragraphs: string[];
  }>;
};

describe("dek cues", () => {
  test("returns Cue[] as JSON without a TTS engine", async () => {
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

> skip this

- not spoken

## architecture

さて。

### hook

Use \`dek\`.
`,
          },
        ],
      },
      async (root) => {
        const result = await runDek(["cues", "--json"], {
          cwd: join(root, "decks", "demo"),
        });
        expect(result.exitCode).toBe(0);
        const json = jsonStdout<CuesOk>(result);
        expect(json.ok).toBe(true);
        expect(json.name).toBe("demo");
        expect(json.cues).toEqual([
          {
            position: { slideIndex: 0, beatIndex: 0 },
            slug: "intro",
            line: 5,
            paragraphs: ["hello"],
          },
          {
            position: { slideIndex: 1, beatIndex: 0 },
            slug: "architecture",
            line: 17,
            paragraphs: ["さて。", "Use dek."],
          },
        ]);
      },
    );
  });

  test("prints spoken paragraphs as text", async () => {
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
`,
          },
        ],
      },
      async (root) => {
        const result = await runDek(["cues"], { cwd: join(root, "decks", "demo") });
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("intro #1");
        expect(result.stdout).toContain("hello");
      },
    );
  });
});
