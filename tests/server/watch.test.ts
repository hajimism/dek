import { describe, expect, test } from "bun:test";
import { mkdir, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createEventHub } from "../../src/server/hub.ts";
import { watchDeck } from "../../src/server/watch.ts";
import { withTempProject } from "../helpers/project.ts";
import { waitForEvent } from "../helpers/server.ts";

const voiceToml = `engine = "voicevox"
speaker = "ずんだもん/ノーマル"
speed = 1
`;

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
