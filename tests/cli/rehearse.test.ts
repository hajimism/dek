import { describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { spawnDekServer } from "../helpers/cli.ts";
import { slideDocument } from "../helpers/html.ts";
import { withTempProject } from "../helpers/project.ts";
import { withDevServer } from "../helpers/server.ts";

const introHtml = slideDocument(`<section class="slide" data-layout="title">
  <h2 class="slide-title">intro</h2>
</section>`);

describe("dek rehearse", () => {
  test("starts the dev server with ?rehearse", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        const { url, stdout, stop } = await spawnDekServer(join(root, "decks", "demo"), {
          args: ["rehearse"],
        });
        try {
          expect(stdout).toContain("rehearse");
          const page = await fetch(url);
          expect(page.ok).toBe(true);
          expect(await page.text()).toContain("dek-data");
        } finally {
          await stop();
        }
      },
    );
  });
});

describe("voice timeline route", () => {
  test("serves a handwritten timeline.json", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        const dir = join(root, "decks", "demo", ".cache", "voice");
        await mkdir(dir, { recursive: true });
        await writeFile(
          join(dir, "timeline.json"),
          `${JSON.stringify({ audio: "", durationMs: 0, beats: [] })}\n`,
        );
        await withDevServer({ cwd: join(root, "decks", "demo") }, async (server) => {
          const res = await fetch(new URL("/voice/timeline.json", server.url));
          expect(res.ok).toBe(true);
          const body = (await res.json()) as { durationMs: number };
          expect(body.durationMs).toBe(0);
        });
      },
    );
  });
});
