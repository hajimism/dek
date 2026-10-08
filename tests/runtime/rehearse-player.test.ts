import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { realpathSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Position } from "../../src/core/step.ts";
import type { Timeline } from "../../src/core/timeline.ts";
import {
  currentSlug,
  dekLive,
  mountPlayer,
  playerChannelName,
  pressKey,
  settle,
  unmountPlayer,
} from "../helpers/dom.ts";
import { slideDocument } from "../helpers/html.ts";
import { writeProject } from "../helpers/project.ts";
import { waitFor } from "../helpers/wait.ts";

const script = `---
title: Demo
---

## intro

hello

## steps

body

### one

a

### two

b

### three

c

## last

end
`;

/** Far enough apart that no scheduled move fires while a test runs. */
const GAP = 600_000;

function timeline(positions: Position[]): Timeline {
  return {
    audio: "audio.wav",
    durationMs: GAP * (positions.length + 1),
    beats: positions.map((position, index) => ({
      position,
      start: index * GAP,
      end: index * GAP + 1,
      sentences: [],
      lead: 0,
    })),
  };
}

const EVERY_STOP: Position[] = [
  { slideIndex: 0, beatIndex: 0 },
  { slideIndex: 1, beatIndex: 0 },
  { slideIndex: 1, beatIndex: 1 },
  { slideIndex: 1, beatIndex: 2 },
  { slideIndex: 1, beatIndex: 3 },
  { slideIndex: 2, beatIndex: 0 },
];

/** Stands in for the voice track: it records what the player asks of it. */
class FakeAudio {
  static made: FakeAudio[] = [];
  currentTime = 0;
  playing = false;
  constructor(readonly src: string) {
    FakeAudio.made.push(this);
  }
  play(): Promise<void> {
    this.playing = true;
    return Promise.resolve();
  }
  pause(): void {
    this.playing = false;
  }
}

/** A position socket to a server that never answers, so the peers here are the windows. */
class SilentSocket {
  readyState = 0;
  addEventListener(): void {}
  send(): void {}
  close(): void {}
}

let root = "";
let fetches: string[] = [];
const realFetch = globalThis.fetch;
const realAudio = globalThis.Audio;
const realWebSocket = globalThis.WebSocket;

beforeAll(async () => {
  root = realpathSync(await mkdtemp(join(tmpdir(), "dek-")));
  await writeProject(root, {
    decks: [
      {
        name: "demo",
        script,
        slides: {
          intro: slideDocument(`<section class="slide"><h2>intro</h2></section>`),
          steps: slideDocument(`<section class="slide"><p data-step="one">A</p></section>`),
          last: slideDocument(`<section class="slide"><h2>last</h2></section>`),
        },
      },
    ],
  });
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

afterEach(async () => {
  open?.close();
  open = undefined;
  await unmountPlayer();
  globalThis.fetch = realFetch;
  globalThis.Audio = realAudio;
  globalThis.WebSocket = realWebSocket;
});

type Peer = { heard: Position[]; post: (position: Position) => void; close: () => void };
let open: Peer | undefined;

/**
 * Open the deck in rehearse mode, serving `served` as the timeline, and wait for it to load.
 * Returns a peer window that listened from before the timeline arrived.
 */
async function mount(
  hash: string,
  options: { served?: Timeline; audio?: boolean } = {},
): Promise<Peer> {
  fetches = [];
  FakeAudio.made = [];
  const served = options.served ?? timeline(EVERY_STOP);
  // Only the dev server has a rehearsal to serve.
  await mountPlayer(join(root, "decks", "demo"), {
    live: true,
    url: `http://localhost:3000/?rehearse${hash}`,
    beforeStart: () => {
      (globalThis as { WebSocket: unknown }).WebSocket = SilentSocket;
      globalThis.fetch = (async (input: string | URL | Request) => {
        const url = String(input);
        // The speaker's page also asks for its marks and annotations: none.
        if (!url.includes("/voice/")) {
          return Response.json({ ok: true, positions: [], annotations: [] });
        }
        fetches.push(url);
        if (url.endsWith("timeline.json")) {
          return new Response(JSON.stringify(served), { status: 200 });
        }
        return new Response("", { status: options.audio ? 200 : 404 });
      }) as typeof fetch;
      globalThis.Audio = FakeAudio as unknown as typeof Audio;
    },
  });
  open = peer();
  await loaded(2);
  return open;
}

/** Wait until `count` fetches have been made and the answers handled. */
async function loaded(count: number): Promise<void> {
  await waitFor(() => fetches.length >= count);
  for (let i = 0; i < 5; i++) {
    await settle();
  }
}

/** A peer window on the deck's channel: what it hears, and a way to speak. */
function peer(): Peer {
  const channel = new BroadcastChannel(playerChannelName());
  const heard: Position[] = [];
  channel.addEventListener("message", (event: MessageEvent) => heard.push(event.data));
  return {
    heard,
    post: (position) => channel.postMessage(position),
    close: () => channel.close(),
  };
}

/** An animation that runs until something calls `finish()`, as a slow transition does. */
function runningAnimation(): { finish: () => void } {
  let done: () => void = () => undefined;
  const animation = {
    playState: "running",
    effect: { getComputedTiming: () => ({ endTime: 750 }) },
    finished: new Promise<void>((resolve) => {
      done = resolve;
    }),
    finish() {
      animation.playState = "finished";
      done();
    },
  };
  return animation;
}

describe("rehearse mode", () => {
  test.serial("starts where the deck opened without sending peers to the first slide", async () => {
    const other = await mount("#last");
    expect(currentSlug()).toBe("last");
    expect(other.heard.some((position) => position.slideIndex === 0)).toBe(false);
  });

  test.serial("a new timeline stops the old voice track before the new one plays", async () => {
    await mount("#intro", { audio: true });
    expect(FakeAudio.made.length).toBe(1);
    await dekLive({ type: "timeline" });
    await loaded(4);
    expect(FakeAudio.made.length).toBe(2);
    expect(FakeAudio.made.map((audio) => audio.playing)).toEqual([false, true]);
  });

  test.serial("follows a peer without sending its move back", async () => {
    const other = await mount("#intro");
    other.heard.length = 0;
    other.post({ slideIndex: 1, beatIndex: 1 });
    await waitFor(() => currentSlug() === "steps");
    await settle();
    expect(location.hash).toBe("#steps/1");
    expect(other.heard).toEqual([]);
  });

  test.serial("a stop the timeline lacks moves there instead of back to the start", async () => {
    const other = await mount("#intro", {
      served: timeline(EVERY_STOP.filter((position) => position.beatIndex !== 2)),
    });
    other.heard.length = 0;
    other.post({ slideIndex: 1, beatIndex: 2 });
    await waitFor(() => location.hash === "#steps/2");
    await settle();
    expect(currentSlug()).toBe("steps");
    expect(other.heard).toEqual([]);
  });

  test.serial("counts every press made while a move is still animating", async () => {
    await mount("#intro");
    const animation = runningAnimation();
    (document as { getAnimations: () => unknown[] }).getAnimations = () => [animation];
    for (let i = 0; i < 5; i++) {
      pressKey("ArrowRight");
    }
    await waitFor(() => currentSlug() === "last");
    expect(location.hash).toBe("#last");
  });
});
