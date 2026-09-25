import { describe, expect, spyOn, test } from "bun:test";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DekError } from "../../src/core/error.ts";
import { startDevServer } from "../../src/server/dev.ts";
import { POLL_INTERVAL_MS } from "../../src/server/watch.ts";
import { spawnDekServer } from "../helpers/cli.ts";
import { slideDocument } from "../helpers/html.ts";
import { assetFixturesDir } from "../helpers/paths.ts";
import { defaultScript, withTempProject } from "../helpers/project.ts";
import { waitForEvent, withDevServer } from "../helpers/server.ts";
import { WAIT_MS } from "../helpers/wait.ts";

async function waitForSseEvent(
  res: Response,
  predicate: (chunk: string) => boolean,
  timeoutMs = WAIT_MS,
): Promise<string> {
  if (!res.body) {
    throw new Error("SSE response has no body");
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const remaining = Math.max(1, deadline - Date.now());
    const chunk = await Promise.race([
      reader.read(),
      new Promise<undefined>((resolve) => setTimeout(resolve, remaining)),
    ]);
    if (chunk?.value) {
      buf += decoder.decode(chunk.value, { stream: true });
    }
    if (predicate(buf)) {
      await reader.cancel();
      return buf;
    }
    if (chunk?.done) {
      break;
    }
  }
  await reader.cancel().catch(() => undefined);
  throw new Error(`timed out waiting for SSE event: ${buf}`);
}

const introHtml = slideDocument(`<section class="slide" data-layout="title">
  <h2 class="slide-title">intro</h2>
</section>`);

const leftoverHtml = slideDocument(`<section class="slide" data-layout="title">
  <h2 class="slide-title">leftover</h2>
</section>`);

function waitForWsOpen(ws: WebSocket, timeoutMs = WAIT_MS): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("websocket open timed out")), timeoutMs);
    ws.addEventListener("open", () => {
      clearTimeout(timer);
      resolve();
    });
    ws.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error("websocket error"));
    });
  });
}

function waitForWsMessage(ws: WebSocket, timeoutMs = WAIT_MS): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("websocket message timed out")), timeoutMs);
    ws.addEventListener("message", (event) => {
      clearTimeout(timer);
      resolve(String(event.data));
    });
    ws.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error("websocket error"));
    });
  });
}

async function waitForOk(url: string, timeoutMs = WAIT_MS): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(url);
    if (res.ok) {
      return;
    }
    await Bun.sleep(50);
  }
  throw new Error(`timed out waiting for ${url}`);
}

async function waitForPage(
  url: string,
  predicate: (html: string) => boolean,
  timeoutMs = WAIT_MS,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(url);
    if (res.ok && predicate(await res.text())) {
      return;
    }
    await Bun.sleep(50);
  }
  throw new Error(`timed out waiting for ${url} to change`);
}

describe("startDevServer", () => {
  // setInterval is process-wide; a concurrent test's server would show up in the spy.
  test.serial("re-scans the project and every deck at pollIntervalMs", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        const spy = spyOn(globalThis, "setInterval");
        try {
          const server = await startDevServer({ cwd: root, port: 0, pollIntervalMs: 123 });
          await server.close();
          const intervals = spy.mock.calls.map((call) => call[1]);
          // One for the project's decks directory, one for the deck.
          expect(intervals.filter((ms) => ms === 123)).toHaveLength(2);
          expect(intervals).not.toContain(POLL_INTERVAL_MS);
        } finally {
          spy.mockRestore();
        }
      },
    );
  });

  test("serves the player and presenter from a deck directory", async () => {
    await withTempProject(
      {
        decks: [{ name: "demo", slides: { intro: introHtml } }],
      },
      async (root) => {
        await withDevServer({ cwd: join(root, "decks", "demo") }, async (server) => {
          const player = await fetch(server.url);
          expect(player.ok).toBe(true);
          expect(player.headers.get("cache-control")).toBe("no-store");
          const playerHtml = await player.text();
          expect(playerHtml).toContain("intro");
          expect(playerHtml).toContain("EventSource");

          const presenter = await fetch(new URL("/presenter", server.url));
          expect(presenter.ok).toBe(true);
          expect(await presenter.text()).toContain("hello");
        });
      },
    );
  });

  test("refuses a move from another site and answers 404 for a path it does not serve", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        await withDevServer({ cwd: join(root, "decks", "demo") }, async (server) => {
          const cross = await fetch(new URL("/goto", server.url), {
            method: "POST",
            headers: { origin: "https://attacker.example", "content-type": "text/plain" },
            body: JSON.stringify({ slug: "intro" }),
          });
          expect(cross.status).toBe(403);
          expect((await fetch(new URL("/nope", server.url))).status).toBe(404);
          expect((await fetch(new URL("/presenter", server.url))).status).toBe(200);
        });
      },
    );
  });

  test("stays scoped to a deck whose script.md fails to parse", async () => {
    await withTempProject(
      {
        decks: [{ name: "demo", slides: { intro: introHtml } }],
      },
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        await writeFile(join(deckDir, "script.md"), "this is not a deck\n");
        await withDevServer({ cwd: deckDir }, async (server) => {
          expect(server.deckDir).toBe(deckDir);
          const res = await fetch(server.url);
          const html = await res.text();
          expect(html).not.toContain('href="/decks/demo/"');
          expect(html).toContain("frontmatter");
        });
      },
    );
  });

  test("lists decks from the project root", async () => {
    await withTempProject(
      {
        decks: [{ name: "demo", slides: { intro: introHtml } }],
      },
      async (root) => {
        await withDevServer({ cwd: root }, async (server) => {
          const res = await fetch(server.url);
          expect(res.ok).toBe(true);
          expect(res.headers.get("cache-control")).toBe("no-store");
          const html = await res.text();
          expect(html).toContain("demo");
          expect(html).toContain('href="/decks/demo/"');
        });
      },
    );
  });

  test("scopes to a deck name from the project root", async () => {
    await withTempProject(
      {
        decks: [{ name: "demo", slides: { intro: introHtml } }],
      },
      async (root) => {
        await withDevServer({ cwd: root, deck: "demo" }, async (server) => {
          expect(server.deckDir).toBe(join(root, "decks", "demo"));
          const player = await fetch(server.url);
          expect(player.ok).toBe(true);
          const html = await player.text();
          expect(html).toContain("intro");
          expect(html).not.toContain('href="/decks/demo/"');
        });
      },
    );
  });

  test("refreshes presenter notes after a script-only edit", async () => {
    await withTempProject(
      {
        decks: [{ name: "demo", slides: { intro: introHtml } }],
      },
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        await withDevServer({ cwd: deckDir }, async (server) => {
          const before = await (await fetch(new URL("/presenter", server.url))).text();
          expect(before).toContain("hello");
          expect(before).not.toContain("rewritten notes");

          const pending = waitForEvent(server.events, (event) => event.type === "sync");
          await writeFile(
            join(deckDir, "script.md"),
            `---
title: Demo
---

## intro

rewritten notes
`,
          );
          expect(await pending).toMatchObject({ type: "sync", created: [] });
          const after = await (await fetch(new URL("/presenter", server.url))).text();
          expect(after).toContain("rewritten notes");
          expect(after).not.toContain("hello");
        });
      },
    );
  });

  test("syncs a skeleton slide when script.md is saved", async () => {
    await withTempProject(
      {
        decks: [{ name: "demo", slides: { intro: introHtml } }],
      },
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        await withDevServer({ cwd: deckDir }, async (server) => {
          const pending = waitForEvent(server.events, (event) => event.type === "sync");
          await writeFile(
            join(deckDir, "script.md"),
            `---
title: Demo
---

## intro

hello

## extra {#extra}

more
`,
          );
          const event = await pending;
          expect(event).toMatchObject({ type: "sync" });
          expect(existsSync(join(deckDir, "slides", "extra.html"))).toBe(true);
          const page = await (await fetch(server.url)).text();
          expect(page).toContain("extra");
        });
      },
    );
  });

  test("watches a deck that failed to parse at start", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        const brokenDir = join(root, "decks", "broken");
        await mkdir(join(brokenDir, "slides"), { recursive: true });
        await writeFile(join(brokenDir, "script.md"), "not a script\n");
        await withDevServer({ cwd: root }, async (server) => {
          const synced = waitForEvent(server.events, (event) => event.type === "sync");
          await writeFile(join(brokenDir, "script.md"), defaultScript("Broken"));
          await synced;
          await waitForOk(new URL("/decks/broken/", server.url).href);
          const pending = waitForEvent(server.events, (event) => event.type === "reload-slide");
          await writeFile(join(brokenDir, "slides", "intro.html"), introHtml);
          expect(await pending).toMatchObject({ type: "reload-slide", slug: "intro" });
        });
      },
    );
  });

  test("watches a deck created after the server starts", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        await withDevServer({ cwd: root }, async (server) => {
          const created = join(root, "decks", "newone");
          await mkdir(join(created, "slides"), { recursive: true });
          await writeFile(join(created, "script.md"), defaultScript("New"));
          await waitForOk(new URL("/decks/newone/", server.url).href);
          const pending = waitForEvent(server.events, (event) => event.type === "reload-slide");
          await writeFile(join(created, "slides", "intro.html"), introHtml);
          expect(await pending).toMatchObject({ type: "reload-slide", slug: "intro" });
        });
      },
    );
  });

  test("lists a deck created after the server starts on the index", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        await withDevServer({ cwd: root }, async (server) => {
          // Cache the index first so the new deck must invalidate it, not just render fresh.
          expect(await (await fetch(server.url)).text()).not.toContain("newone");
          const created = join(root, "decks", "newone");
          await mkdir(join(created, "slides"), { recursive: true });
          await writeFile(join(created, "script.md"), defaultScript("New"));
          await waitForPage(server.url, (html) => html.includes("newone"));
        });
      },
    );
  });

  test("syncs on start and emits reload-slide when a slide is saved", async () => {
    await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
      const deckDir = join(root, "decks", "demo");
      await withDevServer({ cwd: deckDir }, async (server) => {
        // The server synced the script on start, so the slide is a skeleton, not a placeholder.
        const page = await (await fetch(server.url)).text();
        expect(page).toContain('data-slug="intro"');
        expect(page).not.toContain("data-missing");
        expect(page).not.toContain('class="dek-diagnostics"');

        const pending = waitForEvent(server.events, (event) => event.type === "reload-slide");
        await writeFile(join(deckDir, "slides", "intro.html"), introHtml);
        expect(await pending).toMatchObject({ type: "reload-slide", slug: "intro" });
      });
    });
  });

  test("reloads when a slide file is deleted", async () => {
    await withTempProject(
      {
        decks: [{ name: "demo", slides: { intro: introHtml } }],
      },
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        await withDevServer({ cwd: deckDir }, async (server) => {
          const pending = waitForEvent(
            server.events,
            (event) => event.type === "sync" && (event.removed?.includes("intro") ?? false),
          );
          await unlink(join(deckDir, "slides", "intro.html"));
          expect(await pending).toMatchObject({ type: "sync", removed: ["intro"] });
        });
      },
    );
  });

  test("emits reload-theme when theme.css is saved", async () => {
    await withTempProject(
      {
        decks: [
          { name: "demo", theme: ".slide { width: 1280px; }\n", slides: { intro: introHtml } },
        ],
      },
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        await withDevServer({ cwd: deckDir }, async (server) => {
          const pending = waitForEvent(server.events, (event) => event.type === "reload-theme");
          await writeFile(
            join(deckDir, "theme.css"),
            ".slide { width: 1280px; background: red; }\n",
          );
          expect(await pending).toMatchObject({ type: "reload-theme" });
        });
      },
    );
  });

  test("emits reload-theme when a slide stylesheet is saved, and serves it scoped", async () => {
    await withTempProject(
      {
        decks: [
          { name: "demo", theme: ".slide { width: 1280px; }\n", slides: { intro: introHtml } },
        ],
      },
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        await withDevServer({ cwd: deckDir }, async (server) => {
          const pending = waitForEvent(server.events, (event) => event.type === "reload-theme");
          await writeFile(join(deckDir, "slides", "intro.css"), ".mark { opacity: 0; }\n");
          expect(await pending).toMatchObject({ type: "reload-theme" });
          const css = await (await fetch(server.url)).text();
          expect(css).toContain('.slide:where([data-slug="intro"]) .mark');
        });
      },
    );
  });

  test("reloads the page when a slide script is saved", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        await withDevServer({ cwd: deckDir }, async (server) => {
          const pending = waitForEvent(server.events, (event) => event.type === "reload-script");
          await writeFile(join(deckDir, "slides", "intro.ts"), "export default {};\n");
          expect(await pending).toEqual({ type: "reload-script", slugs: ["intro"] });
        });
      },
    );
  });

  test("streams reload events over SSE", async () => {
    await withTempProject(
      {
        decks: [{ name: "demo", slides: { intro: introHtml } }],
      },
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        await withDevServer({ cwd: deckDir }, async (server) => {
          const res = await fetch(new URL("/events", server.url));
          expect(res.ok).toBe(true);
          expect(res.headers.get("content-type")).toContain("text/event-stream");

          const pending = waitForSseEvent(res, (event) => event.includes("reload-slide"));
          await writeFile(
            join(deckDir, "slides", "intro.html"),
            introHtml.replace("intro", "intro-updated"),
          );
          expect(await pending).toContain("reload-slide");
        });
      },
    );
  });

  test("serves deck assets for live pages that keep relative URLs", async () => {
    const withImage = slideDocument(`<section class="slide" data-layout="title">
  <h2 class="slide-title">intro</h2>
  <img src="assets/pixel.png" alt="">
</section>`);
    await withTempProject(
      {
        decks: [{ name: "demo", slides: { intro: withImage } }],
      },
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        await copyFile(join(assetFixturesDir, "pixel.png"), join(deckDir, "assets", "pixel.png"));
        await withDevServer({ cwd: deckDir }, async (server) => {
          const page = await (await fetch(server.url)).text();
          expect(page).toContain('src="assets/pixel.png"');
          expect(page).not.toContain("data:image/png;base64,");
          const asset = await fetch(new URL("/assets/pixel.png", server.url));
          expect(asset.ok).toBe(true);
          expect((await asset.arrayBuffer()).byteLength).toBeGreaterThan(0);
        });
      },
    );
  });

  test("serves deck assets under /decks/<name>/assets from the project root", async () => {
    const withImage = slideDocument(`<section class="slide" data-layout="title">
  <h2 class="slide-title">intro</h2>
  <img src="assets/pixel.png" alt="">
</section>`);
    await withTempProject(
      {
        decks: [{ name: "demo", slides: { intro: withImage } }],
      },
      async (root) => {
        await copyFile(
          join(assetFixturesDir, "pixel.png"),
          join(root, "decks", "demo", "assets", "pixel.png"),
        );
        await withDevServer({ cwd: root }, async (server) => {
          const page = await fetch(new URL("/decks/demo/", server.url));
          expect(await page.text()).toContain('src="assets/pixel.png"');
          const asset = await fetch(new URL("/decks/demo/assets/pixel.png", server.url));
          expect(asset.status).toBe(200);
        });
      },
    );
  });

  test("serves a slide fragment and theme CSS for live patching", async () => {
    await withTempProject(
      {
        decks: [{ name: "demo", slides: { intro: introHtml } }],
      },
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        await withDevServer({ cwd: deckDir }, async (server) => {
          const pending = waitForEvent(server.events, (event) => event.type === "reload-slide");
          await writeFile(
            join(deckDir, "slides", "intro.html"),
            introHtml.replace("intro", "intro-updated"),
          );
          await pending;
          const slide = await fetch(new URL("/slide/intro", server.url));
          expect(slide.ok).toBe(true);
          const html = await slide.text();
          expect(html).toContain("intro-updated");
          expect(html).toContain('data-slug="intro"');
          expect(html.startsWith("<section")).toBe(true);
          expect(html).not.toContain("data:image/png;base64,");

          const theme = await fetch(new URL("/theme", server.url));
          expect(theme.ok).toBe(true);
          expect(theme.headers.get("content-type")).toContain("text/css");
        });
      },
    );
  });

  test("serves deck-prefixed fragments from the project root", async () => {
    await withTempProject(
      {
        decks: [{ name: "demo", slides: { intro: introHtml } }],
      },
      async (root) => {
        await withDevServer({ cwd: root }, async (server) => {
          const slide = await fetch(new URL("/decks/demo/slide/intro", server.url));
          expect(slide.ok).toBe(true);
          expect(await slide.text()).toContain('data-slug="intro"');
          const theme = await fetch(new URL("/decks/demo/theme", server.url));
          expect(theme.ok).toBe(true);
        });
      },
    );
  });

  test("emits diagnostics when a slide is saved", async () => {
    await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
      const deckDir = join(root, "decks", "demo");
      await withDevServer({ cwd: deckDir }, async (server) => {
        const pending = waitForEvent(
          server.events,
          (event) => event.type === "diagnostics" && event.diagnostics.length === 0,
        );
        await writeFile(join(deckDir, "slides", "intro.html"), introHtml);
        const event = await pending;
        expect(event).toMatchObject({ type: "diagnostics" });
        if (event.type === "diagnostics") {
          expect(event.diagnostics).toEqual([]);
        }
      });
    });
  });

  test("includes DEK030 on save when a playwright runner is available", async () => {
    await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
      const deckDir = join(root, "decks", "demo");
      await withDevServer(
        {
          cwd: deckDir,
          visual: true,
          visualRunner: async () => ({
            overflows: [{ slug: "intro", step: "1", box: "h2" }],
            contrasts: [],
          }),
        },
        async (server) => {
          const pending = waitForEvent(
            server.events,
            (event) =>
              event.type === "diagnostics" && event.diagnostics.some((d) => d.id === "DEK030"),
          );
          await writeFile(join(deckDir, "slides", "intro.html"), introHtml);
          const event = await pending;
          expect(event).toMatchObject({ type: "diagnostics" });
          if (event.type === "diagnostics") {
            expect(event.diagnostics.some((d) => d.id === "DEK030")).toBe(true);
          }
        },
      );
    });
  });

  test("visual-lints only the saved slug", async () => {
    const architectureHtml = slideDocument(`<section class="slide" data-layout="title">
  <h2 class="slide-title">architecture</h2>
</section>`);
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
            slides: { intro: introHtml, architecture: architectureHtml },
          },
        ],
      },
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        const slugs: string[] = [];
        let recording = false;
        await withDevServer(
          {
            cwd: deckDir,
            visual: true,
            visualRunner: async (request) => {
              if (recording) {
                slugs.push(
                  ...request.pages
                    .map((page) => page.slug)
                    .filter((slug): slug is string => Boolean(slug)),
                );
              }
              return { overflows: [], contrasts: [] };
            },
          },
          async (server) => {
            await waitForEvent(server.events, (event) => event.type === "diagnostics");
            recording = true;
            const pending = waitForEvent(server.events, (event) => event.type === "diagnostics");
            await writeFile(join(deckDir, "slides", "intro.html"), introHtml);
            await pending;
            expect(slugs.length).toBeGreaterThan(0);
            expect(slugs.every((slug) => slug === "intro")).toBe(true);
          },
        );
      },
    );
  });

  test("serves a deck from the project index path", async () => {
    await withTempProject(
      {
        decks: [{ name: "demo", slides: { intro: introHtml } }],
      },
      async (root) => {
        await withDevServer({ cwd: root }, async (server) => {
          const res = await fetch(new URL("/decks/demo/", server.url));
          expect(res.ok).toBe(true);
          expect(await res.text()).toContain("intro");
        });
      },
    );
  });

  test("does not delete orphan HTML and reports DEK002", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            slides: { intro: introHtml, leftover: leftoverHtml },
          },
        ],
      },
      async (root) => {
        const leftover = join(root, "decks", "demo", "slides", "leftover.html");
        await withDevServer({ cwd: join(root, "decks", "demo") }, async (server) => {
          expect(existsSync(leftover)).toBe(true);
          expect(await readFile(leftover, "utf8")).toContain("leftover");
          const event = await waitForEvent(
            server.events,
            (entry) =>
              entry.type === "diagnostics" && entry.diagnostics.some((d) => d.id === "DEK002"),
          );
          expect(event).toMatchObject({ type: "diagnostics" });
        });
      },
    );
  });

  test("broadcasts position to other /ws clients", async () => {
    await withTempProject(
      {
        decks: [{ name: "demo", slides: { intro: introHtml } }],
      },
      async (root) => {
        await withDevServer({ cwd: join(root, "decks", "demo") }, async (server) => {
          const wsUrl = new URL("/ws", server.url);
          wsUrl.protocol = "ws:";
          const sender = new WebSocket(wsUrl);
          const receiver = new WebSocket(wsUrl);
          try {
            await Promise.all([waitForWsOpen(sender), waitForWsOpen(receiver)]);
            const pending = waitForWsMessage(receiver);
            sender.send(JSON.stringify({ slideIndex: 0, beatIndex: 0 }));
            expect(JSON.parse(await pending)).toEqual({ slideIndex: 0, beatIndex: 0 });
          } finally {
            sender.close();
            receiver.close();
          }
        });
      },
    );
  });

  test("does not broadcast position across decks from the project root", async () => {
    await withTempProject(
      {
        decks: [
          { name: "alpha", slides: { intro: introHtml } },
          { name: "beta", slides: { intro: introHtml } },
        ],
      },
      async (root) => {
        await withDevServer({ cwd: root }, async (server) => {
          const alphaUrl = new URL("/decks/alpha/ws", server.url);
          alphaUrl.protocol = "ws:";
          const betaUrl = new URL("/decks/beta/ws", server.url);
          betaUrl.protocol = "ws:";
          const alphaSender = new WebSocket(alphaUrl);
          const alphaReceiver = new WebSocket(alphaUrl);
          const betaReceiver = new WebSocket(betaUrl);
          try {
            await Promise.all([
              waitForWsOpen(alphaSender),
              waitForWsOpen(alphaReceiver),
              waitForWsOpen(betaReceiver),
            ]);
            const sameDeck = waitForWsMessage(alphaReceiver);
            const crossed = waitForWsMessage(betaReceiver, 400).then(
              () => "received",
              () => "timed out",
            );
            alphaSender.send(JSON.stringify({ slideIndex: 0, beatIndex: 1 }));
            expect(JSON.parse(await sameDeck)).toEqual({ slideIndex: 0, beatIndex: 1 });
            expect(await crossed).toBe("timed out");
          } finally {
            alphaSender.close();
            alphaReceiver.close();
            betaReceiver.close();
          }
        });
      },
    );
  });

  test("POST /goto broadcasts position and GET /current returns it", async () => {
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
            slides: { intro: introHtml, architecture: leftoverHtml },
          },
        ],
      },
      async (root) => {
        await withDevServer({ cwd: join(root, "decks", "demo") }, async (server) => {
          const current = await fetch(new URL("/current", server.url));
          expect(current.ok).toBe(true);
          expect(await current.json()).toMatchObject({
            slug: "intro",
            slideIndex: 0,
            beatIndex: 0,
          });

          const wsUrl = new URL("/ws", server.url);
          wsUrl.protocol = "ws:";
          const client = new WebSocket(wsUrl);
          try {
            await waitForWsOpen(client);
            const pending = waitForWsMessage(client);
            const gotoRes = await fetch(new URL("/goto", server.url), {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ slug: "architecture" }),
            });
            expect(gotoRes.ok).toBe(true);
            expect(JSON.parse(await pending)).toEqual({ slideIndex: 1, beatIndex: 0 });
          } finally {
            client.close();
          }

          const after = await fetch(new URL("/current", server.url));
          expect(await after.json()).toMatchObject({
            slug: "architecture",
            slideIndex: 1,
            beatIndex: 0,
          });
        });
      },
    );
  });

  test("GET /current follows the last websocket position", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        await withDevServer({ cwd: join(root, "decks", "demo") }, async (server) => {
          const wsUrl = new URL("/ws", server.url);
          wsUrl.protocol = "ws:";
          const client = new WebSocket(wsUrl);
          try {
            await waitForWsOpen(client);
            client.send(JSON.stringify({ slideIndex: 0, beatIndex: 0 }));
            await Bun.sleep(50);
            const current = await fetch(new URL("/current", server.url));
            expect(await current.json()).toMatchObject({
              slug: "intro",
              slideIndex: 0,
              beatIndex: 0,
            });
          } finally {
            client.close();
          }
        });
      },
    );
  });

  test("does not broadcast invalid websocket payloads", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        await withDevServer({ cwd: join(root, "decks", "demo") }, async (server) => {
          const wsUrl = new URL("/ws", server.url);
          wsUrl.protocol = "ws:";
          const receiver = new WebSocket(wsUrl);
          const sender = new WebSocket(wsUrl);
          try {
            await Promise.all([waitForWsOpen(receiver), waitForWsOpen(sender)]);
            const pending = waitForWsMessage(receiver);
            sender.send("not-json");
            sender.send(JSON.stringify({ slideIndex: 0, beatIndex: 0 }));
            expect(JSON.parse(await pending)).toEqual({ slideIndex: 0, beatIndex: 0 });
          } finally {
            receiver.close();
            sender.close();
          }
        });
      },
    );
  });

  test("writes .dek/server.json while running and removes it on close", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        const lock = join(root, ".dek", "server.json");
        await withDevServer({ cwd: join(root, "decks", "demo") }, async (server) => {
          expect(existsSync(lock)).toBe(true);
          const data = JSON.parse(await readFile(lock, "utf8")) as { url: string; pid: number };
          expect(data.url).toBe(server.url);
          expect(data.pid).toBe(process.pid);
        });
        expect(existsSync(lock)).toBe(false);
      },
    );
  });

  test("names the taken port and how to pick another", async () => {
    const taken = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response("") });
    try {
      await withTempProject(
        { decks: [{ name: "demo", slides: { intro: introHtml } }] },
        async (root) => {
          await expect(
            startDevServer({ cwd: join(root, "decks", "demo"), port: taken.port }),
          ).rejects.toMatchObject({
            message: `port ${taken.port} is already in use`,
            hint: "pass another --port, or omit it to let the OS choose",
          });
        },
      );
    } finally {
      taken.stop(true);
    }
  });

  test("refuses to start when another server lock is alive", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        await withDevServer({ cwd: join(root, "decks", "demo") }, async (server) => {
          await expect(startDevServer({ cwd: join(root, "decks", "demo") })).rejects.toMatchObject({
            message: expect.stringContaining(server.url),
          });
        });
      },
    );
  });

  test("stops the loser when two servers race on the same project", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        const cwd = join(root, "decks", "demo");
        const results = await Promise.allSettled([
          startDevServer({ cwd, port: 0 }),
          startDevServer({ cwd, port: 0 }),
        ]);
        const won = results.filter((result) => result.status === "fulfilled");
        const lost = results.filter((result) => result.status === "rejected");
        expect(won).toHaveLength(1);
        expect(lost).toHaveLength(1);
        const winner = won[0]?.status === "fulfilled" ? won[0].value : undefined;
        if (!winner) {
          throw new Error("expected one server to start");
        }
        const loserReason = lost[0]?.status === "rejected" ? lost[0].reason : undefined;
        expect(loserReason).toBeInstanceOf(DekError);
        expect((await fetch(winner.url)).ok).toBe(true);
        await winner.close();
      },
    );
  });

  test("keeps serving when dek.toml disappears mid-session", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        await withDevServer({ cwd: root }, async (server) => {
          await rm(join(root, "dek.toml"));
          await writeFile(join(root, "decks", "demo", "script.md"), defaultScript("Changed"));
          await waitForEvent(server.events, (event) => event.type === "sync");
          const response = await fetch(new URL("/decks/demo/", server.url));
          expect([200, 500]).toContain(response.status);
        });
      },
    );
  });
});

type RemoteDevServer = {
  url: string;
  listenHostname: string;
  remoteUrls: string[];
};

function asRemote(server: { url: string }): RemoteDevServer {
  return server as RemoteDevServer;
}

function basicAuth(password: string, user = "dek"): string {
  return `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`;
}

const speakerNotes = "SPEAKER_NOTES_ONLY";

const notesScript = `---
title: Demo
---

## intro

${speakerNotes}
`;

const twoSlideScript = `---
title: Demo
---

## intro

hello

## architecture

body
`;

describe("startDevServer --remote", () => {
  test("keeps the lock URL on loopback while listening on all interfaces", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        const lock = join(root, ".dek", "server.json");
        await withDevServer({ cwd: join(root, "decks", "demo"), remote: true }, async (server) => {
          const remote = asRemote(server);
          expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
          expect(remote.listenHostname).toBe("0.0.0.0");
          expect(Array.isArray(remote.remoteUrls)).toBe(true);
          expect(remote.remoteUrls.some((url) => url.includes("127.0.0.1"))).toBe(true);

          const data = JSON.parse(await readFile(lock, "utf8")) as { url: string };
          expect(data.url).toBe(server.url);
          expect(data.url).toContain("127.0.0.1");

          const player = await fetch(server.url);
          expect(player.ok).toBe(true);
        });
      },
    );
  });

  test("a server scoped to one deck serves none of the project's other decks", async () => {
    await withTempProject(
      {
        decks: [
          { name: "demo", slides: { intro: introHtml } },
          {
            name: "secret",
            slides: { intro: slideDocument('<section class="slide">SECRET SLIDE</section>') },
            assets: { "plan.txt": "SECRET ASSET" },
          },
        ],
      },
      async (root) => {
        await withDevServer({ cwd: join(root, "decks", "demo"), remote: true }, async (server) => {
          for (const path of [
            "/decks/secret/slide/intro",
            "/decks/secret/theme",
            "/decks/secret/assets/plan.txt",
            "/decks/secret/",
          ]) {
            const res = await fetch(new URL(path, server.url));
            expect({ path, status: res.status }).toEqual({ path, status: 404 });
            expect(await res.text()).not.toContain("SECRET");
          }
          expect((await fetch(new URL("/slide/intro", server.url))).status).toBe(200);
          expect((await fetch(new URL("/decks/demo/slide/intro", server.url))).status).toBe(200);
        });
      },
    );
  });

  test("lets a phone in as the presenter once with a pairing code, then by cookie", async () => {
    await withTempProject(
      { decks: [{ name: "demo", script: notesScript, slides: { intro: introHtml } }] },
      async (root) => {
        await withDevServer({ cwd: join(root, "decks", "demo"), remote: true }, async (server) => {
          const code = (server.pair as () => string)();
          const paired = await fetch(new URL(`/presenter?pair=${code}`, server.url), {
            redirect: "manual",
          });
          // The code leaves the address bar and the history at once.
          expect(paired.status).toBe(303);
          expect(paired.headers.get("location")).toBe("/presenter");
          const cookie = paired.headers.get("set-cookie") ?? "";
          expect(cookie).toContain("HttpOnly");
          expect(cookie).toContain("SameSite=Lax");
          const session = cookie.split(";")[0] as string;

          const presenter = await fetch(new URL("/presenter", server.url), {
            headers: { cookie: session },
          });
          expect(presenter.status).toBe(200);
          expect(await presenter.text()).toContain(speakerNotes);
          const current = await fetch(new URL("/current", server.url), {
            headers: { cookie: session },
          });
          expect(current.status).toBe(200);

          const again = await fetch(new URL(`/presenter?pair=${code}`, server.url), {
            redirect: "manual",
          });
          expect(again.status).toBe(403);
          expect(await again.text()).toContain("press Enter");
          const forged = await fetch(new URL("/presenter", server.url), {
            headers: { cookie: `${session.split("=")[0]}=guess` },
          });
          expect(forged.status).toBe(401);
        });
      },
    );
  });

  test("refuses a pairing code once it expires", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        await withDevServer(
          { cwd: join(root, "decks", "demo"), remote: true, pairingTtlMs: 1 },
          async (server) => {
            const code = (server.pair as () => string)();
            await Bun.sleep(5);
            const res = await fetch(new URL(`/presenter?pair=${code}`, server.url), {
              redirect: "manual",
            });
            expect(res.status).toBe(403);
          },
        );
      },
    );
  });

  test("a local server has no pairing", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        await withDevServer({ cwd: join(root, "decks", "demo") }, async (server) => {
          expect(server.pair).toBeUndefined();
        });
      },
    );
  });

  test("protects presenter with HTTP Basic and leaves the player open", async () => {
    await withTempProject(
      {
        decks: [{ name: "demo", script: notesScript, slides: { intro: introHtml } }],
      },
      async (root) => {
        await withDevServer(
          { cwd: join(root, "decks", "demo"), remote: true, password: "secret" },
          async (server) => {
            const presenter = await fetch(new URL("/presenter", server.url));
            expect(presenter.status).toBe(401);
            expect(presenter.headers.get("www-authenticate")).toContain("Basic");
            expect(presenter.headers.get("www-authenticate")).toContain("dek presenter");

            const wrong = await fetch(new URL("/presenter", server.url), {
              headers: { authorization: basicAuth("nope") },
            });
            expect(wrong.status).toBe(401);

            const ok = await fetch(new URL("/presenter", server.url), {
              headers: { authorization: basicAuth("secret") },
            });
            expect(ok.ok).toBe(true);
            expect(await ok.text()).toContain(speakerNotes);

            const player = await fetch(server.url);
            expect(player.ok).toBe(true);
            const playerHtml = await player.text();
            expect(playerHtml).not.toContain(speakerNotes);
            expect(playerHtml).not.toContain("dek-presenter");

            const viaQuery = await fetch(new URL("/?presenter", server.url));
            expect(viaQuery.ok).toBe(true);
            const queryHtml = await viaQuery.text();
            expect(queryHtml).not.toContain(speakerNotes);
            expect(queryHtml).not.toContain("dek-presenter");
          },
        );
      },
    );
  });

  test("protects /decks/<name>/presenter from the project root", async () => {
    await withTempProject(
      {
        decks: [{ name: "demo", script: notesScript, slides: { intro: introHtml } }],
      },
      async (root) => {
        await withDevServer({ cwd: root, remote: true, password: "secret" }, async (server) => {
          const presenter = await fetch(new URL("/decks/demo/presenter", server.url));
          expect(presenter.status).toBe(401);
          expect(presenter.headers.get("www-authenticate")).toContain("Basic");

          const ok = await fetch(new URL("/decks/demo/presenter", server.url), {
            headers: { authorization: basicAuth("secret", "") },
          });
          expect(ok.ok).toBe(true);
          expect(await ok.text()).toContain(speakerNotes);

          const player = await fetch(new URL("/decks/demo/", server.url));
          expect(player.ok).toBe(true);
          expect(await player.text()).not.toContain(speakerNotes);
        });
      },
    );
  });

  test("protects goto and current while leaving the websocket open", async () => {
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
            slides: { intro: introHtml, architecture: leftoverHtml },
          },
        ],
      },
      async (root) => {
        await withDevServer(
          { cwd: join(root, "decks", "demo"), remote: true, password: "secret" },
          async (server) => {
            const wsUrl = new URL("/ws", server.url);
            wsUrl.protocol = "ws:";
            const client = new WebSocket(wsUrl);
            try {
              await waitForWsOpen(client);
              client.send(JSON.stringify({ slideIndex: 0, beatIndex: 0 }));
              await Bun.sleep(50);
            } finally {
              client.close();
            }

            const denied = await fetch(new URL("/goto", server.url), {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ slug: "architecture" }),
            });
            expect(denied.status).toBe(401);

            const gotoRes = await fetch(new URL("/goto", server.url), {
              method: "POST",
              headers: {
                "content-type": "application/json",
                authorization: basicAuth("secret"),
              },
              body: JSON.stringify({ slug: "architecture" }),
            });
            expect(gotoRes.ok).toBe(true);
            const current = await fetch(new URL("/current", server.url), {
              headers: { authorization: basicAuth("secret") },
            });
            expect(await current.json()).toMatchObject({
              slug: "architecture",
              slideIndex: 1,
              beatIndex: 0,
            });
          },
        );
      },
    );
  });

  test("ignores position updates from an unauthenticated websocket", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            script: twoSlideScript,
            slides: { intro: introHtml, architecture: leftoverHtml },
          },
        ],
      },
      async (root) => {
        await withDevServer(
          { cwd: join(root, "decks", "demo"), remote: true, password: "secret" },
          async (server) => {
            const wsUrl = new URL("/ws", server.url);
            wsUrl.protocol = "ws:";
            const client = new WebSocket(wsUrl);
            try {
              await waitForWsOpen(client);
              client.send(JSON.stringify({ slideIndex: 1, beatIndex: 0 }));
              await Bun.sleep(50);
            } finally {
              client.close();
            }

            const current = await fetch(new URL("/current", server.url), {
              headers: { authorization: basicAuth("secret") },
            });
            expect(await current.json()).toMatchObject({
              slug: "intro",
              slideIndex: 0,
              beatIndex: 0,
            });
          },
        );
      },
    );
  });

  test("accepts websocket position updates with a token query", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            script: twoSlideScript,
            slides: { intro: introHtml, architecture: leftoverHtml },
          },
        ],
      },
      async (root) => {
        await withDevServer(
          { cwd: join(root, "decks", "demo"), remote: true, password: "secret" },
          async (server) => {
            const receiverUrl = new URL("/ws", server.url);
            receiverUrl.protocol = "ws:";
            const senderUrl = new URL("/ws", server.url);
            senderUrl.protocol = "ws:";
            senderUrl.searchParams.set("token", "secret");
            const receiver = new WebSocket(receiverUrl);
            const sender = new WebSocket(senderUrl);
            try {
              await Promise.all([waitForWsOpen(receiver), waitForWsOpen(sender)]);
              const pending = waitForWsMessage(receiver);
              sender.send(JSON.stringify({ slideIndex: 1, beatIndex: 0 }));
              expect(JSON.parse(await pending)).toEqual({ slideIndex: 1, beatIndex: 0 });
            } finally {
              receiver.close();
              sender.close();
            }

            const current = await fetch(new URL("/current", server.url), {
              headers: { authorization: basicAuth("secret") },
            });
            expect(await current.json()).toMatchObject({
              slug: "architecture",
              slideIndex: 1,
              beatIndex: 0,
            });
          },
        );
      },
    );
  });

  test("embeds the live token on the presenter page only", async () => {
    await withTempProject(
      {
        decks: [{ name: "demo", script: notesScript, slides: { intro: introHtml } }],
      },
      async (root) => {
        await withDevServer(
          { cwd: join(root, "decks", "demo"), remote: true, password: "secret" },
          async (server) => {
            const presenter = await fetch(new URL("/presenter", server.url), {
              headers: { authorization: basicAuth("secret") },
            });
            const presenterHtml = await presenter.text();
            expect(presenterHtml).toContain('data-live-token="secret"');

            const player = await fetch(server.url);
            const playerHtml = await player.text();
            expect(playerHtml).not.toContain("data-live-token");
            expect(playerHtml).not.toContain("secret");
          },
        );
      },
    );
  });

  test("clears the presenter's event stream by its token, outside the deck's path too", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        await withDevServer({ cwd: root, remote: true, password: "secret" }, async (server) => {
          const page = await fetch(new URL("/decks/demo/presenter", server.url), {
            headers: { authorization: basicAuth("secret") },
          });
          const token = (await page.text()).match(/data-live-token="([^"]*)"/)?.[1];
          expect(token).toBe("secret");
          const player = await fetch(new URL("/decks/demo/", server.url));
          expect(await player.text()).not.toContain("data-live-token");

          // Basic auth covers only /decks/demo/, so the stream at the root carries the token.
          const stream = await fetch(new URL(`/events?token=${token}`, server.url));
          const diagnosed = waitForSseEvent(stream, (buf) => buf.includes('"diagnostics"'));
          await writeFile(join(deckDir, "slides", "intro.html"), introHtml.replace("intro", "x"));
          await diagnosed;
        });
      },
    );
  });
});

describe("startDevServer --remote exposure", () => {
  test("keeps the voice timeline and audio, made from the script, behind the password", async () => {
    await withTempProject(
      { decks: [{ name: "demo", script: notesScript, slides: { intro: introHtml } }] },
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        const voiceDir = join(deckDir, ".cache", "voice");
        await mkdir(voiceDir, { recursive: true });
        await writeFile(
          join(voiceDir, "timeline.json"),
          `${JSON.stringify({ audio: "audio.wav", durationMs: 0, beats: [{ text: speakerNotes }] })}\n`,
        );
        await writeFile(join(voiceDir, "audio.wav"), "RIFF");
        await withDevServer({ cwd: deckDir, remote: true, password: "secret" }, async (server) => {
          for (const path of ["/voice/timeline.json", "/voice/audio.wav"]) {
            const open = await fetch(new URL(path, server.url));
            expect(open.status).toBe(401);
            expect(await open.text()).not.toContain(speakerNotes);
            const authorized = await fetch(new URL(path, server.url), {
              headers: { authorization: basicAuth("secret") },
            });
            expect(authorized.status).toBe(200);
          }
        });
      },
    );
  });

  test("streams diagnostics to the presenter only, and reloads to everyone", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        await withDevServer({ cwd: deckDir, remote: true, password: "secret" }, async (server) => {
          const audience = await fetch(new URL("/events", server.url));
          const presenter = await fetch(new URL("/events", server.url), {
            headers: { authorization: basicAuth("secret") },
          });
          const diagnosed = waitForSseEvent(presenter, (buf) => buf.includes('"diagnostics"'));
          await writeFile(join(deckDir, "slides", "intro.html"), introHtml.replace("intro", "x"));
          await diagnosed;
          // A later event marks the end of what the audience was sent for the save.
          const heard = waitForSseEvent(audience, (buf) => buf.includes("reload-theme"));
          await writeFile(join(deckDir, "theme.css"), ":root {}\n");
          const sent = await heard;
          expect(sent).toContain("reload-slide");
          expect(sent).not.toContain('"diagnostics"');
        });
      },
    );
  });
});

describe("startDevServer requests", () => {
  test("closes while more than one browser holds /events open", async () => {
    await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
      const server = await startDevServer({ cwd: join(root, "decks", "demo"), port: 0 });
      const streams = await Promise.all(
        [0, 1].map(() => fetch(new URL("/events", server.url)).then((res) => res.body)),
      );
      for (const stream of streams) {
        await stream?.getReader().read();
      }
      const closed = await Promise.race([
        server.close().then(() => true),
        Bun.sleep(2000).then(() => false),
      ]);
      expect(closed).toBe(true);
    });
  });

  test("refuses an asset symlink that leads out of the deck", async () => {
    await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
      const deckDir = join(root, "decks", "demo");
      await writeFile(join(root, "secret.txt"), "top secret\n");
      await symlink(join(root, "secret.txt"), join(deckDir, "assets", "p.png"));
      await withDevServer({ cwd: deckDir }, async (server) => {
        const res = await fetch(new URL("/assets/p.png", server.url));
        expect(res.status).toBe(404);
        expect(await res.text()).not.toContain("top secret");
      });
    });
  });

  test("answers 400 to malformed percent-encoding on any route", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        await withDevServer({ cwd: root }, async (server) => {
          for (const path of [
            "/decks/demo/assets/%E0%A4%A",
            "/decks/demo/slide/%E0%A4%A",
            "/decks/%E0%A4%A/",
          ]) {
            const res = await fetch(new URL(path, server.url));
            expect(res.status).toBe(400);
            expect(await res.text()).not.toContain(root);
          }
        });
      },
    );
  });

  test("answers an unexpected failure with a bare 500 and logs it to stderr", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        const logged = spyOn(console, "error").mockImplementation(() => undefined);
        try {
          await withDevServer({ cwd: deckDir }, async (server) => {
            await rm(join(deckDir, "slides", "intro.html"));
            await mkdir(join(deckDir, "slides", "intro.html"));
            const res = await fetch(new URL("/slide/intro", server.url));
            expect(res.status).toBe(500);
            const body = await res.text();
            expect(body).not.toContain(root);
            expect(body).not.toContain("dev.ts");
            expect(logged).toHaveBeenCalled();
          });
        } finally {
          logged.mockRestore();
        }
      },
    );
  });
});

describe("dek (dev server CLI)", () => {
  test("prints a URL and serves the deck", async () => {
    await withTempProject(
      {
        decks: [{ name: "demo", slides: { intro: introHtml } }],
      },
      async (root) => {
        const { url, stop } = await spawnDekServer(join(root, "decks", "demo"));
        try {
          expect(url).toMatch(/^https?:\/\//);
          const res = await fetch(url);
          expect(res.ok).toBe(true);
        } finally {
          await stop();
        }
      },
    );
  });

  test("prints the presenter URL and the password it made for --remote", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        const { url, stdout, stop } = await spawnDekServer(join(root, "decks", "demo"), {
          args: ["--remote"],
          ready: (buf) => buf.includes("password: "),
        });
        try {
          expect(url).toContain("127.0.0.1");
          expect(stdout).toContain("127.0.0.1");
          expect(stdout).toContain("/presenter");
          expect(stdout).toMatch(/password: [a-km-np-z2-9]{10} \(any user name\)/);
        } finally {
          await stop();
        }
      },
    );
  });
});
