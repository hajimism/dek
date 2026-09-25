import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { realpathSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { currentSlug, mountPlayer, pressKey, settle, unmountPlayer } from "../helpers/dom.ts";
import { slideDocument } from "../helpers/html.ts";
import { writeProject } from "../helpers/project.ts";

/** Stands in for the server's socket: it records what the player sends and can drop the line. */
class FakeWebSocket {
  static readonly OPEN = 1;
  static made: FakeWebSocket[] = [];
  readyState = 0;
  sent: string[] = [];
  private listeners: Array<[string, (event: { data?: unknown }) => void]> = [];
  constructor(readonly url: string) {
    FakeWebSocket.made.push(this);
    setTimeout(() => {
      this.readyState = 1;
      this.emit("open");
    }, 0);
  }
  addEventListener(type: string, listener: (event: { data?: unknown }) => void): void {
    this.listeners.push([type, listener]);
  }
  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {
    this.readyState = 3;
  }
  drop(): void {
    this.readyState = 3;
    this.emit("close");
  }
  emit(type: string, event: { data?: unknown } = {}): void {
    for (const [name, listener] of this.listeners) {
      if (name === type) {
        listener(event);
      }
    }
  }
}

let root = "";

beforeAll(async () => {
  root = realpathSync(await mkdtemp(join(tmpdir(), "dek-")));
  await writeProject(root, {
    decks: [
      {
        name: "demo",
        script:
          "---\ntitle: Demo\n---\n\n## intro\n\nhello\n\n## next\n\nthere\n\n## last\n\nend\n",
        slides: {
          intro: slideDocument(`<section class="slide"><h2>intro</h2></section>`),
          next: slideDocument(`<section class="slide"><h2>next</h2></section>`),
          last: slideDocument(`<section class="slide"><h2>last</h2></section>`),
        },
      },
    ],
  });
  await mountPlayer(join(root, "decks", "demo"), {
    url: "http://localhost:3000/demo/#intro",
    beforeStart: () => {
      (globalThis as { WebSocket: unknown }).WebSocket = FakeWebSocket;
      // What the dev server writes on a presenter page behind `--remote`.
      document.body.dataset.live = "true";
      document.body.dataset.liveToken = "a b";
    },
  });
});

afterAll(async () => {
  await unmountPlayer();
  await rm(root, { recursive: true, force: true });
});

describe("the player's line to the server", () => {
  test.serial("comes back after a drop and sends the move made while it was down", async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    const first = FakeWebSocket.made[0];
    expect(first?.url).toStartWith("ws://localhost:3000/");
    expect(first?.url).toEndWith("/ws?token=a%20b");
    first?.drop();
    pressKey("ArrowRight");
    await settle();
    expect(currentSlug()).toBe("next");
    // The first retry waits at most half a second.
    await new Promise((resolve) => setTimeout(resolve, 600));
    const second = FakeWebSocket.made[1];
    expect(FakeWebSocket.made).toHaveLength(2);
    expect(second?.sent).toEqual([JSON.stringify({ slideIndex: 1, beatIndex: 0 })]);
  });

  test.serial("follows the server once back", async () => {
    FakeWebSocket.made[1]?.emit("message", {
      data: JSON.stringify({ slideIndex: 2, beatIndex: 0 }),
    });
    await settle();
    expect(currentSlug()).toBe("last");
  });
});
