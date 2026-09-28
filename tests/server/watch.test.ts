import { describe, expect, test } from "bun:test";
import { mkdir, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DekError } from "../../src/core/error.ts";
import type { LiveEvent } from "../../src/core/live-protocol.ts";
import { syncDeck } from "../../src/core/sync.ts";
import { createEventHub, type EventHub } from "../../src/server/hub.ts";
import { voiceFailureLine, watchDeck, watchErrorDiagnostic } from "../../src/server/watch.ts";
import { withTempDir } from "../helpers/fs.ts";
import { slideDocument } from "../helpers/html.ts";
import { withTempProject } from "../helpers/project.ts";
import { waitForEvent } from "../helpers/server.ts";
import { WAIT_MS } from "../helpers/wait.ts";

const voiceToml = `engine = "voicevox"
speaker = "ずんだもん/ノーマル"
speed = 1
`;

const introHtml = slideDocument(`<section class="slide" data-layout="title">
  <h2 class="slide-title">intro</h2>
</section>`);

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
      const watcher = watchDeck(deckDir, emitTo(hub), {
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
      const watcher = watchDeck(deckDir, emitTo(hub), {
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
        const watcher = watchDeck(deckDir(root), emitTo(hub), {
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

  test("a slide script that hangs does not stall the server while lint runs", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        const hub = createEventHub();
        const diagnostics = waitForEvent(
          hub,
          (event) =>
            event.type === "diagnostics" &&
            event.diagnostics.some((diagnostic) => diagnostic.id === "DEK016"),
        );
        const watcher = watchDeck(deckDir(root), emitTo(hub), { pollIntervalMs: 20 });
        // A synchronous evaluation holds the loop for the sandbox's whole 1s timeout, so a
        // timer due long before that could only fire after the diagnostics are out.
        let ticked = false;
        let tickedFirst: boolean | undefined;
        void diagnostics.then(
          () => {
            tickedFirst = ticked;
          },
          () => {},
        );
        try {
          await writeFile(
            join(deckDir(root), "slides", "intro.ts"),
            // A statement, not a comment, keeps it apart in the cache: transpiling drops comments,
            // and a hit would skip the evaluation this test is about.
            `const run = "${crypto.randomUUID()}";\nwhile (true) {}\nexport default {};`,
          );
          const probe = setTimeout(() => {
            ticked = true;
          }, 100);
          await diagnostics;
          clearTimeout(probe);
          expect(tickedFirst).toBe(true);
        } finally {
          watcher.close();
          hub.close();
        }
      },
    );
  });

  test("creates skeletons for a script written before the watcher started", async () => {
    // A titled heading, so the skeleton has a title and lint has nothing to say (DEK024).
    const script = "---\ntitle: Demo\n---\n\n## intro\n\n## Two {#two}\n\nhello\n";
    await withTempProject(
      { decks: [{ name: "demo", script, slides: { intro: introHtml } }] },
      async (root) => {
        const dir = deckDir(root);
        const hub = createEventHub();
        const events: LiveEvent[] = [];
        const diagnosed = waitForEvent(hub, (event) => {
          const { deck: _deck, ...live } = event;
          events.push(live);
          return event.type === "diagnostics";
        });
        const watcher = watchDeck(dir, emitTo(hub), { pollIntervalMs: 0 });
        try {
          await diagnosed;
          expect(events).toEqual([
            { type: "sync", created: ["two"] },
            { type: "diagnostics", diagnostics: [] },
          ]);
        } finally {
          watcher.close();
          hub.close();
        }
      },
    );
  });

  test("removes an orphan skeleton on sync and names its slug", async () => {
    // A skeleton dek wrote for a section the script has since dropped.
    const before = "---\ntitle: Demo\n---\n\n## intro\n\n## Old {#old}\n";
    const script = "---\ntitle: Demo\n---\n\n## intro\n\n## Two {#two}\n\nhello\n";
    await withTempProject(
      { decks: [{ name: "demo", script: before, slides: { intro: introHtml } }] },
      async (root) => {
        const dir = deckDir(root);
        syncDeck(dir);
        await writeFile(join(dir, "script.md"), script);
        const hub = createEventHub();
        const events: LiveEvent[] = [];
        const diagnosed = waitForEvent(hub, (event) => {
          const { deck: _deck, ...live } = event;
          events.push(live);
          return event.type === "diagnostics";
        });
        const watcher = watchDeck(dir, emitTo(hub), { pollIntervalMs: 0 });
        try {
          await diagnosed;
          expect(events).toEqual([
            { type: "sync", created: ["two"], removed: ["old"] },
            { type: "diagnostics", diagnostics: [] },
          ]);
        } finally {
          watcher.close();
          hub.close();
        }
      },
    );
  });

  test("starts quietly when every section already has its slide", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        const hub = createEventHub();
        const events: string[] = [];
        const diagnosed = waitForEvent(hub, (event) => {
          events.push(event.type);
          return event.type === "diagnostics";
        });
        const watcher = watchDeck(deckDir(root), emitTo(hub), { pollIntervalMs: 0 });
        try {
          await diagnosed;
          expect(events).toEqual(["diagnostics"]);
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
        const watcher = watchDeck(dir, emitTo(hub), { pollIntervalMs: 20 });
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
        const watcher = watchDeck(dir, emitTo(hub), {
          pollIntervalMs: 20,
          visual: true,
          visualRunner: async () => {
            calls += 1;
            throw new Error("boom");
          },
        });
        try {
          const event = await first;
          expect(calls).toBe(1);
          // The browser learns that the visual pass crashed instead of seeing a clean list.
          expect(event.type === "diagnostics" ? event.diagnostics : []).toContainEqual(
            expect.objectContaining({ id: "error", severity: "error", message: "boom" }),
          );
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
        const watcher = watchDeck(deckDir(root), emitTo(hub), {
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

describe("watchDeck diagnostics", () => {
  test("merges edits made while a pass runs into one pass after it", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        const dir = deckDir(root);
        const gate = createGate();
        let calls = 0;
        const hub = createEventHub();
        const watcher = watchDeck(dir, emitTo(hub), {
          pollIntervalMs: 20,
          visual: true,
          visualRunner: async () => {
            calls += 1;
            if (calls === 1) {
              await gate.opened;
            }
            return { overflows: [], contrasts: [] };
          },
        });
        try {
          await waitFor(() => calls === 1);
          const slidePath = join(dir, "slides", "intro.html");
          for (const offset of [10_000, 20_000]) {
            const reloaded = waitForEvent(hub, (event) => event.type === "reload-slide");
            await writeFile(slidePath, `${introHtml}\n`);
            const later = new Date(Date.now() + offset);
            await utimes(slidePath, later, later);
            await reloaded;
          }
          gate.open();
          await waitFor(() => calls === 2);
          // Two edits, one pass: a third call would mean each edit ran its own.
          await Bun.sleep(100);
          expect(calls).toBe(2);
        } finally {
          gate.open();
          watcher.close();
          hub.close();
        }
      },
    );
  });

  test("emits nothing once closed, even for a pass that was running", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        const gate = createGate();
        let started = false;
        const events: LiveEvent[] = [];
        const watcher = watchDeck(deckDir(root), (event) => events.push(event), {
          pollIntervalMs: 20,
          visual: true,
          visualRunner: async () => {
            started = true;
            await gate.opened;
            return { overflows: [], contrasts: [] };
          },
        });
        await waitFor(() => started);
        watcher.close();
        const seen = events.length;
        gate.open();
        await Bun.sleep(100);
        expect(events).toHaveLength(seen);
      },
    );
  });

  test("announces no timeline once closed, even for a synthesis that was running", async () => {
    await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
      const dir = deckDir(root);
      const gate = createGate();
      let started = false;
      const events: LiveEvent[] = [];
      const watcher = watchDeck(dir, (event) => events.push(event), {
        pollIntervalMs: 20,
        synthVoice: async () => {
          started = true;
          await gate.opened;
        },
      });
      await mkdir(join(dir, "voice"), { recursive: true });
      await writeFile(join(dir, "voice", "voice.toml"), voiceToml);
      await waitFor(() => started);
      watcher.close();
      gate.open();
      await Bun.sleep(100);
      expect(events.filter((event) => event.type === "timeline")).toEqual([]);
    });
  });
});

describe("watchDeck scan", () => {
  // A scan runs from a timer, where a throw would end the dev server.
  test("reports a slides folder it may not read instead of throwing", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        await withTempDir(async (outside) => {
          let scan: (() => void) | undefined;
          const hub = createEventHub();
          const watcher = watchDeck(deckDir(root), emitTo(hub), {
            pollIntervalMs: 50_000,
            setInterval: ((handler: () => void) => {
              scan = handler;
              return 0;
            }) as unknown as typeof setInterval,
            clearInterval: (() => {}) as typeof clearInterval,
          });
          try {
            const reported = waitForEvent(
              hub,
              (event) =>
                event.type === "diagnostics" &&
                event.diagnostics.some((diagnostic) => diagnostic.message.includes("outside")),
            );
            await rm(join(deckDir(root), "slides"), { recursive: true });
            await symlink(outside, join(deckDir(root), "slides"));
            expect(() => scan?.()).not.toThrow();
            await reported;
          } finally {
            watcher.close();
            hub.close();
          }
        });
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
  const watcher = watchDeck(deckDir(root), emitTo(hub), {
    pollIntervalMs,
    setInterval: setIntervalSpy,
  });
  return { polls: () => polls, watcher, hub };
}

/** What a watcher of deck "demo" emits, into `hub` as the project watch passes it on. */
function emitTo(hub: EventHub): (event: LiveEvent) => void {
  return (event) => hub.emit({ ...event, deck: "demo" });
}

function deckDir(root: string): string {
  return join(root, "decks", "demo");
}

describe("voiceFailureLine", () => {
  test("says what failed and what to do in one line, with no stack", () => {
    expect(
      voiceFailureLine(
        new DekError("voicevox is not running at http://127.0.0.1:50021", {
          hint: "start it with docker",
        }),
      ),
    ).toBe("voice: voicevox is not running at http://127.0.0.1:50021 (start it with docker)");
    expect(voiceFailureLine(new Error("boom"))).toBe("voice: boom");
  });
});

describe("watchDeck on a script that does not read", () => {
  test("shows every reason at once, as lint does", async () => {
    const script = "---\ntitle: Demo\n---\n\n## 日本語\n\n## Bad {#Bad}\n";
    await withTempProject({ decks: [{ name: "demo", script }] }, async (root) => {
      const hub = createEventHub();
      const diagnosed = waitForEvent(hub, (event) => event.type === "diagnostics");
      const watcher = watchDeck(deckDir(root), emitTo(hub), { pollIntervalMs: 0 });
      try {
        const event = await diagnosed;
        if (event.type !== "diagnostics") {
          throw new Error("expected diagnostics");
        }
        expect(event.diagnostics.map((d) => [d.id, d.line])).toEqual([
          ["DEK027", 5],
          ["DEK027", 7],
        ]);
      } finally {
        watcher.close();
        hub.close();
      }
    });
  });
});

describe("watchErrorDiagnostic", () => {
  test("keeps a DekError's location and its hint, the next step the author sees", () => {
    expect(
      watchErrorDiagnostic(
        new DekError("bad frontmatter", { path: "decks/demo/script.md", line: 2, hint: "fix it" }),
      ),
    ).toEqual({
      id: "parse",
      severity: "error",
      message: "bad frontmatter",
      path: "decks/demo/script.md",
      line: 2,
      hint: "fix it",
    });
    expect(watchErrorDiagnostic(new Error("boom"))).toEqual({
      id: "error",
      severity: "error",
      message: "boom",
    });
  });
});

function createGate(): { opened: Promise<void>; open: () => void } {
  let open = (): void => undefined;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { opened, open };
}

async function waitFor(condition: () => boolean, timeoutMs = WAIT_MS): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error("timed out waiting for a condition");
    }
    await Bun.sleep(10);
  }
}
