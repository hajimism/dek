import { describe, expect, test } from "bun:test";
import { DekError } from "../../src/core/error.ts";
import {
  engineBaseUrl,
  engineMissingError,
  engineNameForUrl,
  engineSetupHint,
  resolveStyleId,
} from "../../src/voice/engine.ts";

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

describe("engineSetupHint", () => {
  test("points VOICEVOX users at the download page and the Docker image", () => {
    const hint = engineSetupHint("voicevox");
    expect(hint).toContain("https://voicevox.hiroshiba.jp/");
    expect(hint).toContain(
      "docker run --rm -p 127.0.0.1:50021:50021 voicevox/voicevox_engine:cpu-latest",
    );
    expect(hint).toContain("DEK_VOICE_URL");
  });

  test("points AivisSpeech users at its page and image on port 10101", () => {
    const hint = engineSetupHint("aivis:10101");
    expect(hint).toContain("https://aivis-project.com/");
    expect(hint).toContain("ghcr.io/aivis-project/aivisspeech-engine:cpu-latest");
    expect(hint).toContain("10101");
  });

  test("links COEIROINK and SHAREVOX without a Docker command", () => {
    expect(engineSetupHint("coeiroink")).toContain("https://coeiroink.com/");
    expect(engineSetupHint("coeiroink")).not.toContain("docker");
    expect(engineSetupHint("sharevox")).toContain("https://www.sharevox.app/");
  });

  test("falls back to the URL for custom engines", () => {
    const hint = engineSetupHint("http://10.0.0.5:50021");
    expect(hint).toContain("http://10.0.0.5:50021");
    expect(hint).not.toContain("docker");
  });
});

describe("engineNameForUrl", () => {
  test("recovers the engine name from a well-known port", () => {
    expect(engineNameForUrl("http://127.0.0.1:10101")).toBe("aivis");
    expect(engineNameForUrl("http://127.0.0.1:50021/")).toBe("voicevox");
    expect(engineNameForUrl("http://127.0.0.1:9")).toBeUndefined();
  });
});

describe("engineMissingError", () => {
  test("names the engine, the URL, and the setup hint", () => {
    const error = engineMissingError("voicevox", "http://127.0.0.1:50021");
    expect(error).toBeInstanceOf(DekError);
    expect(error.message).toBe("voicevox was not found at http://127.0.0.1:50021");
    expect(error.hint).toContain("https://voicevox.hiroshiba.jp/");
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
