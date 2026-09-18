import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { copyFile, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DekError } from "../../src/core/error.ts";
import { startDevServer } from "../../src/server/dev.ts";
import { spawnDekServer } from "../helpers/cli.ts";
import { slideDocument } from "../helpers/html.ts";
import { assetFixturesDir } from "../helpers/paths.ts";
import { withTempProject } from "../helpers/project.ts";
import { waitForEvent, withDevServer } from "../helpers/server.ts";

async function waitForSseEvent(
  res: Response,
  predicate: (chunk: string) => boolean,
  timeoutMs = 3000,
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

function waitForWsOpen(ws: WebSocket, timeoutMs = 3000): Promise<void> {
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

function waitForWsMessage(ws: WebSocket, timeoutMs = 3000): Promise<string> {
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

describe("startDevServer", () => {
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

  test("emits reload-slide and keeps diagnostics visible", async () => {
    await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
      const deckDir = join(root, "decks", "demo");
      await withDevServer({ cwd: deckDir }, async (server) => {
        const page = await (await fetch(server.url)).text();
        expect(page).toContain('data-slug="intro"');
        expect(page).toContain("data-missing");
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
            await waitForWsMessage(client, 200).catch(() => undefined);
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
            await waitForWsMessage(receiver, 200).catch(() => undefined);
            await waitForWsMessage(sender, 200).catch(() => undefined);
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
              await waitForWsMessage(receiver, 200).catch(() => undefined);
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

  test("embeds a ws token on the presenter page only", async () => {
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
            expect(presenterHtml).toContain('data-ws-token="secret"');

            const player = await fetch(server.url);
            const playerHtml = await player.text();
            expect(playerHtml).not.toContain("data-ws-token");
            expect(playerHtml).not.toContain("secret");
          },
        );
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

  test("prints presenter URL and password for --remote --password", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        const { url, stdout, stop } = await spawnDekServer(join(root, "decks", "demo"), {
          args: ["--remote", "--password", "secret"],
          timeoutMs: 3000,
          ready: (buf) => buf.includes("password: secret"),
        });
        try {
          expect(url).toContain("127.0.0.1");
          expect(stdout).toContain("127.0.0.1");
          expect(stdout).toContain("/presenter");
          expect(stdout).toContain("password: secret");
        } finally {
          await stop();
        }
      },
    );
  });
});
