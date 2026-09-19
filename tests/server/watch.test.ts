import { describe, expect, test } from "bun:test";
import { mkdir, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createEventHub } from "../../src/server/hub.ts";
import { watchDeck, watchTargets } from "../../src/server/watch.ts";
import { slideDocument } from "../helpers/html.ts";
import { withTempProject } from "../helpers/project.ts";
import { waitForEvent } from "../helpers/server.ts";

const voiceToml = `engine = "voicevox"
speaker = "ずんだもん/ノーマル"
speed = 1
`;

const introHtml = slideDocument(`<section class="slide" data-layout="title">
  <h2 class="slide-title">intro</h2>
</section>`);

describe("watchTargets", () => {
  test("includes failed deck directories", () => {
    expect(
      watchTargets({
        decks: [{ dir: "/project/decks/demo" }],
        failed: [{ dir: "/project/decks/broken" }],
      }),
    ).toEqual(["/project/decks/demo", "/project/decks/broken"]);
  });

  test("includes a deck added after start", () => {
    const started = watchTargets({
      decks: [{ dir: "/project/decks/demo" }],
      failed: [],
    });
    const later = watchTargets({
      decks: [{ dir: "/project/decks/demo" }, { dir: "/project/decks/newone" }],
      failed: [],
    });
    expect(started).toEqual(["/project/decks/demo"]);
    expect(later).toEqual(["/project/decks/demo", "/project/decks/newone"]);
  });
});

describe("watchDeck", () => {
  test("does not poll when pollIntervalMs is 0", async () => {
    await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
      const { polls, watcher, hub } = startWatch(root, 0);
      expect(polls()).toBe(0);
      watcher.close();
      hub.close();
    });
  });

  test("starts a poll timer when pollIntervalMs is positive", async () => {
    await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
      const { polls, watcher, hub } = startWatch(root, 50_000);
      expect(polls()).toBe(1);
      watcher.close();
      hub.close();
    });
  });

  test("resynths when voice.toml is overwritten in place", async () => {
    await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
      const deckDir = join(root, "decks", "demo");
      const voicePath = join(deckDir, "voice", "voice.toml");
      await mkdir(join(deckDir, "voice"), { recursive: true });
      await writeFile(voicePath, voiceToml);
      await utimes(voicePath, 1_000_000, 1_000_000);

      let synths = 0;
      const hub = createEventHub();
      const timeline = waitForEvent(hub, (event) => event.type === "timeline");
      const watcher = watchDeck(deckDir, hub, {
        pollIntervalMs: 20,
        synthVoice: async () => {
          synths += 1;
        },
      });
      try {
        await writeFile(voicePath, `${voiceToml}speed = 1.1\n`);
        await timeline;
        expect(synths).toBeGreaterThan(0);
      } finally {
        watcher.close();
        hub.close();
      }
    });
  });

  test("resynths when the voice directory appears with voice.toml", async () => {
    await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
      const deckDir = join(root, "decks", "demo");
      let synths = 0;
      const hub = createEventHub();
      const timeline = waitForEvent(hub, (event) => event.type === "timeline");
      const watcher = watchDeck(deckDir, hub, {
        pollIntervalMs: 20,
        synthVoice: async () => {
          synths += 1;
        },
      });
      try {
        await mkdir(join(deckDir, "voice"), { recursive: true });
        await writeFile(join(deckDir, "voice", "voice.toml"), voiceToml);
        await timeline;
        expect(synths).toBeGreaterThan(0);
      } finally {
        watcher.close();
        hub.close();
      }
    });
  });

  test("does not call visualRunner unless visual is enabled", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        let calls = 0;
        const hub = createEventHub();
        const watcher = watchDeck(deckDir(root), hub, {
          pollIntervalMs: 0,
          visualRunner: async () => {
            calls += 1;
            return { overflows: [], contrasts: [] };
          },
        });
        try {
          await Bun.sleep(20);
          expect(calls).toBe(0);
        } finally {
          watcher.close();
          hub.close();
        }
      },
    );
  });

  test("emits a diagnostic when script.md becomes unparsable", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        const dir = deckDir(root);
        const hub = createEventHub();
        const first = waitForEvent(hub, (event) => event.type === "diagnostics");
        const watcher = watchDeck(dir, hub, { pollIntervalMs: 20 });
        try {
          await first;
          const pending = waitForEvent(hub, (event) => event.type === "diagnostics");
          const scriptPath = join(dir, "script.md");
          await writeFile(scriptPath, "not a deck\n");
          const later = new Date(Date.now() + 10_000);
          await utimes(scriptPath, later, later);
          const event = await pending;
          expect(event.type).toBe("diagnostics");
          if (event.type !== "diagnostics") {
            return;
          }
          expect(event.diagnostics.length).toBeGreaterThan(0);
          expect(
            event.diagnostics.some((diagnostic) =>
              /frontmatter|YAML|script/.test(diagnostic.message),
            ),
          ).toBe(true);
        } finally {
          watcher.close();
          hub.close();
        }
      },
    );
  });

  test("keeps calling visualRunner after a thrown visual pass", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        const dir = deckDir(root);
        let calls = 0;
        const hub = createEventHub();
        const first = waitForEvent(hub, (event) => event.type === "diagnostics");
        const watcher = watchDeck(dir, hub, {
          pollIntervalMs: 20,
          visual: true,
          visualRunner: async () => {
            calls += 1;
            throw new Error("boom");
          },
        });
        try {
          await first;
          expect(calls).toBe(1);
          const pending = waitForEvent(hub, (event) => event.type === "diagnostics");
          const slidePath = join(dir, "slides", "intro.html");
          await writeFile(slidePath, `${introHtml}\n`);
          const later = new Date(Date.now() + 10_000);
          await utimes(slidePath, later, later);
          await pending;
          expect(calls).toBe(2);
        } finally {
          watcher.close();
          hub.close();
        }
      },
    );
  });

  test("calls visualRunner when visual is enabled", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        let calls = 0;
        const hub = createEventHub();
        const pending = waitForEvent(hub, (event) => event.type === "diagnostics");
        const watcher = watchDeck(deckDir(root), hub, {
          pollIntervalMs: 0,
          visual: true,
          visualRunner: async () => {
            calls += 1;
            return { overflows: [], contrasts: [] };
          },
        });
        try {
          await pending;
          expect(calls).toBeGreaterThan(0);
        } finally {
          watcher.close();
          hub.close();
        }
      },
    );
  });
});

function startWatch(root: string, pollIntervalMs: number) {
  let polls = 0;
  const hub = createEventHub();
  const setIntervalSpy: typeof setInterval = ((
    handler: TimerHandler,
    ms?: number,
    ...args: unknown[]
  ) => {
    polls += 1;
    return setInterval(handler, ms, ...args);
  }) as typeof setInterval;
  const watcher = watchDeck(deckDir(root), hub, {
    pollIntervalMs,
    setInterval: setIntervalSpy,
  });
  return { polls: () => polls, watcher, hub };
}

function deckDir(root: string): string {
  return join(root, "decks", "demo");
}
