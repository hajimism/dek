import { describe, expect, test } from "bun:test";
import { createEventHub, SSE_HEARTBEAT_MS } from "../../src/server/hub.ts";

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

describe("createEventHub", () => {
  test("pings SSE clients often enough to outlive Bun's 10s idle timeout", () => {
    expect(SSE_HEARTBEAT_MS).toBeLessThan(10_000);
  });

  test("sends a heartbeat comment to open SSE streams", async () => {
    const hub = createEventHub({ heartbeatMs: 10 });
    try {
      const chunks = await readChunks(hub.subscribe(), 2);
      expect(chunks).toEqual([": connected\n\n", ": ping\n\n"]);
    } finally {
      hub.close();
    }
  });

  test("sends each SSE client only the events it accepts", async () => {
    const hub = createEventHub();
    try {
      const everyone = hub.subscribe();
      const some = hub.subscribe((event) => event.type !== "diagnostics");
      hub.emit({ type: "diagnostics", diagnostics: [] });
      hub.emit({ type: "reload-theme" });
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
});
