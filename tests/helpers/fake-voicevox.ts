import { createServer } from "node:http";
import { encodeWav, silencePcm } from "../../src/voice/wav.ts";

export type FakeVoicevox = {
  url: string;
  close: () => Promise<void>;
  queries: string[];
  /** Answer this path with this status, as an engine that is up but unwell does. */
  failWith?: { path: string; status: number };
};

export async function startFakeVoicevox(): Promise<FakeVoicevox> {
  const queries: string[] = [];
  const fake: FakeVoicevox = { url: "", queries, close: () => Promise.resolve() };
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (fake.failWith && url.pathname === fake.failWith.path) {
      res.writeHead(fake.failWith.status);
      res.end();
      return;
    }
    if (url.pathname === "/speakers") {
      json(res, [
        {
          name: "ずんだもん",
          styles: [{ name: "ノーマル", id: 3 }],
        },
      ]);
      return;
    }
    if (url.pathname === "/version") {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("0.24.1");
      return;
    }
    if (url.pathname === "/audio_query") {
      const text = url.searchParams.get("text") ?? "";
      queries.push(text);
      json(res, {
        accent_phrases: [
          {
            moras: [{ vowel_length: 0.2, consonant_length: 0.05 }],
            accent: 1,
            is_interrogative: false,
          },
        ],
        speedScale: 1,
        pitchScale: 0,
        intonationScale: 1,
        volumeScale: 1,
        prePhonemeLength: 0.05,
        postPhonemeLength: 0.05,
        outputSamplingRate: 24000,
        outputStereo: false,
        kana: `カナ/${text}`,
      });
      return;
    }
    if (url.pathname === "/synthesis") {
      const wav = encodeWav({
        sampleRate: 24000,
        channels: 1,
        bitsPerSample: 16,
        pcm: silencePcm(350, { sampleRate: 24000, channels: 1, bitsPerSample: 16 }),
      });
      res.writeHead(200, { "content-type": "audio/wav" });
      res.end(wav);
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  if (!addr || typeof addr === "string") {
    throw new Error("fake voicevox has no port");
  }
  fake.url = `http://127.0.0.1:${addr.port}`;
  fake.close = () =>
    new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  return fake;
}

function json(res: import("node:http").ServerResponse, body: unknown): void {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}
