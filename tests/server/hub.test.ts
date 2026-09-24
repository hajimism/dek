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
});
