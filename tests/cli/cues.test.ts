import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { cuesCommand } from "../../src/cli/cues.ts";
import { formatText } from "../../src/cli/result.ts";
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
  diagnostics: Array<{ id: string; message: string; line?: number }>;
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
        expect(json.diagnostics).toEqual([]);
      },
    );
  });
});

describe("cuesCommand", () => {
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
        const data = cuesCommand({ cwd: join(root, "decks", "demo") });
        const text = formatText({ command: "cues", data });
        expect(text).toContain("intro #1");
        expect(text).toContain("hello");
      },
    );
  });

  test("warns about beats whose body is never spoken, even without voice/", async () => {
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

### hook {#hook}

spoken

### shown {#shown}

- list only
`,
          },
        ],
      },
      async (root) => {
        const data = cuesCommand({ cwd: join(root, "decks", "demo") });
        expect(data.diagnostics).toHaveLength(1);
        expect(data.diagnostics[0]?.id).toBe("DEK042");
        expect(data.diagnostics[0]?.line).toBe(13);
        const text = formatText({ command: "cues", data });
        expect(text).toContain("intro #2");
        expect(text).toContain("DEK042");
      },
    );
  });

  test("accepts a named deck from the project root", async () => {
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
        const data = cuesCommand({ cwd: root, deck: "demo" });
        expect(data.name).toBe("demo");
        expect(data.cues[0]?.paragraphs).toEqual(["hello"]);
      },
    );
  });
});
