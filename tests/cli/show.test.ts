import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { jsonStdout, runDek } from "../helpers/cli.ts";
import { slideDocument } from "../helpers/html.ts";
import { withTempProject } from "../helpers/project.ts";

const introHtml = slideDocument(`<section class="slide" data-layout="title">
  <h2 class="slide-title">intro</h2>
</section>`);

type ShowOk = {
  ok: true;
  slug: string;
  title: string;
  script: string;
  html: string | null;
};

describe("dek show", () => {
  test("returns the section script and HTML", async () => {
    await withTempProject(
      {
        decks: [{ name: "demo", slides: { intro: introHtml } }],
      },
      async (root) => {
        const result = await runDek(["show", "intro", "--json"], {
          cwd: join(root, "decks", "demo"),
        });
        expect(result.exitCode).toBe(0);
        const json = jsonStdout<ShowOk>(result);
        expect(json.ok).toBe(true);
        expect(json.slug).toBe("intro");
        expect(json.title).toBe("intro");
        expect(json.script).toContain("hello");
        expect(json.html).toContain("<section");
        expect(json.html).toContain("intro");
      },
    );
  });

  test("accepts a positional deck name from the project root", async () => {
    await withTempProject(
      {
        decks: [
          { name: "alpha", slides: { intro: introHtml } },
          { name: "beta", slides: { intro: introHtml } },
        ],
      },
      async (root) => {
        const result = await runDek(["show", "beta", "intro", "--json"], { cwd: root });
        expect(result.exitCode).toBe(0);
        const json = jsonStdout<ShowOk>(result);
        expect(json.slug).toBe("intro");
      },
    );
  });

  test("returns html null when the slide file is missing", async () => {
    await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
      const result = await runDek(["show", "intro", "--json"], {
        cwd: join(root, "decks", "demo"),
      });
      expect(result.exitCode).toBe(0);
      const json = jsonStdout<ShowOk>(result);
      expect(json.ok).toBe(true);
      expect(json.slug).toBe("intro");
      expect(json.script).toContain("hello");
      expect(json.html).toBeNull();
    });
  });
});
