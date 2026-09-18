import { describe, expect, test } from "bun:test";
import { DekError } from "../../src/core/error.ts";
import { engineBaseUrl, resolveStyleId } from "../../src/voice/engine.ts";

const speakers = [
  {
    name: "ずんだもん",
    styles: [
      { name: "ノーマル", id: 3 },
      { name: "あまあま", id: 1 },
    ],
  },
];

describe("engineBaseUrl", () => {
  test.serial("maps engine names and host:port overrides", () => {
    const previous = process.env.DEK_VOICE_URL;
    delete process.env.DEK_VOICE_URL;
    try {
      expect(engineBaseUrl("aivis")).toBe("http://127.0.0.1:10101");
      expect(engineBaseUrl("voicevox:9")).toBe("http://127.0.0.1:9");
      expect(engineBaseUrl("http://127.0.0.1:50021/")).toBe("http://127.0.0.1:50021");
    } finally {
      if (previous === undefined) {
        delete process.env.DEK_VOICE_URL;
      } else {
        process.env.DEK_VOICE_URL = previous;
      }
    }
  });

  test.serial("DEK_VOICE_URL wins over the engine name", () => {
    const previous = process.env.DEK_VOICE_URL;
    process.env.DEK_VOICE_URL = "http://127.0.0.1:9999/";
    try {
      expect(engineBaseUrl("aivis")).toBe("http://127.0.0.1:9999");
    } finally {
      if (previous === undefined) {
        delete process.env.DEK_VOICE_URL;
      } else {
        process.env.DEK_VOICE_URL = previous;
      }
    }
  });
});

describe("resolveStyleId", () => {
  test("resolves speaker/style and defaults to the first style", () => {
    expect(resolveStyleId(speakers, "ずんだもん/あまあま")).toBe(1);
    expect(resolveStyleId(speakers, "ずんだもん")).toBe(3);
  });

  test("throws DekError with a hint when the speaker is missing", () => {
    try {
      resolveStyleId(speakers, "missing/ノーマル");
      throw new Error("expected resolveStyleId to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(DekError);
      expect((error as DekError).message).toContain("missing");
      expect((error as DekError).hint).toContain("dek voice speakers");
    }
  });
});
