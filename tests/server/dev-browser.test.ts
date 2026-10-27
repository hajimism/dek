import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Browser, BrowserContext, Page } from "playwright";
import { importPlaywright, playwrightResolved } from "../../src/core/playwright.ts";
import type { DevServer } from "../../src/server/dev.ts";
import { slideDocument } from "../helpers/html.ts";
import { withTempProject } from "../helpers/project.ts";
import { withDevServer } from "../helpers/server.ts";

// What another site's page can get from a running dev server, in a real Chromium.
const skip = !playwrightResolved() || Boolean(process.env.DEK_PLAYWRIGHT);
const browserTest = test.serial.skipIf(skip);

let browser: Browser | undefined;

beforeAll(async () => {
  if (!skip) {
    browser = await (await importPlaywright()).chromium.launch({ headless: true });
  }
});

afterAll(async () => {
  await browser?.close();
});

/** One second of silence, so an `<audio>` that may load it reads its length. */
function silentWav(): Buffer {
  const samples = 8000;
  const wav = Buffer.alloc(44 + samples * 2);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + samples * 2, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(samples, 24);
  wav.writeUInt32LE(samples * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(samples * 2, 40);
  return wav;
}

/** How the server is started, and the password the browser holds for it, if any. */
type Access = { remote?: boolean; password?: string };

/**
 * A deck with a voice and a theme token, served as `access` says, to a browser that answers the
 * server's password prompt, as one that signed in earlier does.
 */
async function withVoicedDeck(
  access: Access,
  fn: (server: DevServer, context: BrowserContext) => Promise<void>,
) {
  await withTempProject(
    {
      decks: [
        {
          name: "talk",
          script: "---\ntitle: Talk\n---\n\n## intro\n\nWhat only the presenter reads.\n",
          slides: { intro: slideDocument('<section class="slide"><h2>intro</h2></section>') },
          theme: ".slide { --probe: rgb(1, 2, 3); }\n",
        },
      ],
    },
    async (root) => {
      const voiceDir = join(root, "decks", "talk", ".cache", "voice");
      await mkdir(voiceDir, { recursive: true });
      await writeFile(join(voiceDir, "audio.wav"), silentWav());
      await withDevServer({ cwd: root, ...access }, async (server) => {
        if (!browser) {
          throw new Error("no browser");
        }
        // Only the server asks for a password, under either of its names.
        const context = await browser.newContext(
          access.password
            ? { httpCredentials: { username: "dek", password: access.password } }
            : {},
        );
        try {
          await fn(server, context);
        } finally {
          await context.close();
        }
      });
    },
  );
}

/**
 * What the page it runs in learns by embedding the deck served at `origin`: whether the voice
 * and the theme load, for the deck and for one that does not exist, and the theme's token. It
 * also frames the presenter view and the voice, for `framedPaths` to look into. Runs in the
 * browser, so it refers to nothing outside itself.
 */
async function probe(origin: string) {
  const settle = (node: HTMLElement, ready: string) =>
    new Promise<string>((resolve) => {
      node.addEventListener(ready, () => resolve("loaded"));
      node.addEventListener("error", () => resolve("error"));
      setTimeout(() => resolve("timeout"), 5000);
    });
  const audio = (path: string) => {
    const element = new Audio();
    const settled = settle(element, "loadedmetadata");
    element.src = origin + path;
    return settled;
  };
  const sheet = (path: string) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    const settled = settle(link, "load");
    link.href = origin + path;
    document.head.append(link);
    return settled;
  };
  const voice = await audio("/decks/talk/voice/audio.wav");
  const noVoice = await audio("/decks/nowhere/voice/audio.wav");
  const theme = await sheet("/decks/talk/theme");
  const noTheme = await sheet("/decks/nowhere/theme");
  const slide = document.createElement("div");
  slide.className = "slide";
  document.body.append(slide);
  const token = getComputedStyle(slide).getPropertyValue("--probe").trim();
  for (const path of ["/decks/talk/presenter", "/decks/talk/voice/audio.wav"]) {
    const frame = document.createElement("iframe");
    const framed = settle(frame, "load");
    frame.src = origin + path;
    document.body.append(frame);
    await framed;
  }
  return { voice, noVoice, theme, noTheme, token };
}

/** The paths of the server's answers the page's frames show; a refused frame shows an error. */
function framedPaths(page: Page, origin: string): string[] {
  return page
    .frames()
    .filter((frame) => frame !== page.mainFrame() && frame.url().startsWith(`${origin}/`))
    .map((frame) => new URL(frame.url()).pathname)
    .sort();
}

/**
 * Probe the server from a page at each other origin: another site; another port of the server's
 * address; and another port of `localhost`, which Chromium takes for the same site, so that only
 * `same-origin`, not `same-site`, keeps it out. Each finds nothing.
 */
async function expectNothingFromElsewhere(server: DevServer, context: BrowserContext) {
  const port = new URL(server.url).port;
  const site = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () =>
      new Response("<!doctype html><title>elsewhere</title>", {
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
  });
  try {
    for (const [elsewhere, origin] of [
      [`http://localhost:${site.port}/`, `http://127.0.0.1:${port}`],
      [`http://127.0.0.1:${site.port}/`, `http://127.0.0.1:${port}`],
      [`http://localhost:${site.port}/`, `http://localhost:${port}`],
    ] as const) {
      const page = await context.newPage();
      await page.goto(elsewhere);
      const found = await page.evaluate(probe, origin);
      expect({
        elsewhere,
        origin,
        plays: found.voice === "loaded",
        tellsVoicesApart: found.voice !== found.noVoice,
        tellsDecksApart: found.theme !== found.noTheme,
        token: found.token,
        framed: framedPaths(page, origin),
      }).toEqual({
        elsewhere,
        origin,
        plays: false,
        tellsVoicesApart: false,
        tellsDecksApart: false,
        token: "",
        framed: [],
      });
      await page.close();
    }
  } finally {
    site.stop(true);
  }
}

describe("the dev server and another origin's page", () => {
  browserTest(
    "another origin can neither play the voice, read the theme, tell decks apart, nor frame a page",
    async () => {
      await withVoicedDeck({}, expectNothingFromElsewhere);
    },
  );

  browserTest("nor can it with --remote, in a browser signed in with the password", async () => {
    await withVoicedDeck({ remote: true, password: "secret" }, expectNothingFromElsewhere);
  });

  browserTest(
    "the deck's own pages still load the voice and the theme, and frame its views",
    async () => {
      await withVoicedDeck({}, async (server, context) => {
        const origin = server.url.replace(/\/$/, "");
        const page = await context.newPage();
        await page.goto(`${origin}/decks/talk/`);
        const found = await page.evaluate(probe, origin);
        expect(found).toMatchObject({ voice: "loaded", theme: "loaded", noTheme: "error" });
        expect(found.token).toBe("rgb(1, 2, 3)");
        expect(framedPaths(page, origin)).toEqual([
          "/decks/talk/presenter",
          "/decks/talk/voice/audio.wav",
        ]);
      });
    },
  );
});
