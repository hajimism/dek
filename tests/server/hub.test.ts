import { describe, expect, test } from "bun:test";
import { createEventHub, type DeckEvent, SSE_HEARTBEAT_MS } from "../../src/server/hub.ts";

async function readChunks(stream: ReadableStream<Uint8Array>, count: number): Promise<string[]> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  while (chunks.length < count) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    chunks.push(decoder.decode(value));
  }
  reader.releaseLock();
  return chunks;
}

const theme = (deck: string): DeckEvent => ({ type: "reload-theme", deck });

describe("createEventHub", () => {
  test("pings SSE clients often enough to outlive Bun's 10s idle timeout", () => {
    expect(SSE_HEARTBEAT_MS).toBeLessThan(10_000);
  });

  test("hands every event to every listener", () => {
    const hub = createEventHub();
    const a: DeckEvent[] = [];
    const b: DeckEvent[] = [];
    hub.listen((event) => a.push(event));
    hub.listen((event) => b.push(event));
    hub.emit(theme("demo"));
    expect(a).toEqual([theme("demo")]);
    expect(b).toEqual([theme("demo")]);
    hub.close();
  });

  test("stops handing events to a listener once it unsubscribes", () => {
    const hub = createEventHub();
    const heard: DeckEvent[] = [];
    const unlisten = hub.listen((event) => heard.push(event));
    hub.emit(theme("one"));
    unlisten();
    hub.emit(theme("two"));
    expect(heard).toEqual([theme("one")]);
    hub.close();
  });

  test("keeps no event for a listener that comes later", () => {
    const hub = createEventHub();
    hub.emit(theme("early"));
    const heard: DeckEvent[] = [];
    hub.listen((event) => heard.push(event));
    expect(heard).toEqual([]);
    hub.close();
  });

  test("a listener that throws does not keep the event from the rest", () => {
    const hub = createEventHub();
    const heard: DeckEvent[] = [];
    hub.listen(() => {
      throw new Error("boom");
    });
    hub.listen((event) => heard.push(event));
    hub.emit(theme("demo"));
    expect(heard).toEqual([theme("demo")]);
    hub.close();
  });

  test("sends a heartbeat comment to open SSE streams", async () => {
    const hub = createEventHub({ heartbeatMs: 10 });
    try {
      const chunks = await readChunks(hub.sse(), 2);
      expect(chunks).toEqual([": connected\n\n", ": ping\n\n"]);
    } finally {
      hub.close();
    }
  });

  test("sends each SSE client only the events it accepts, without their deck", async () => {
    const hub = createEventHub();
    try {
      const everyone = hub.sse();
      const some = hub.sse((event) => event.type !== "diagnostics");
      hub.emit({ type: "diagnostics", diagnostics: [], deck: "demo" });
      hub.emit(theme("demo"));
      expect(await readChunks(everyone, 3)).toEqual([
        ": connected\n\n",
        'data: {"type":"diagnostics","diagnostics":[]}\n\n',
        'data: {"type":"reload-theme"}\n\n',
      ]);
      expect(await readChunks(some, 2)).toEqual([
        ": connected\n\n",
        'data: {"type":"reload-theme"}\n\n',
      ]);
    } finally {
      hub.close();
    }
  });

  test("close ends every SSE stream and drops every listener", async () => {
    const hub = createEventHub();
    const stream = hub.sse();
    const heard: DeckEvent[] = [];
    hub.listen((event) => heard.push(event));
    hub.close();
    hub.emit(theme("late"));
    const reader = stream.getReader();
    expect((await reader.read()).value).toBeDefined();
    expect((await reader.read()).done).toBe(true);
    expect(heard).toEqual([]);
  });
});
