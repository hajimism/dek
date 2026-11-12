import { describe, expect, test } from "bun:test";
import { readTar } from "../../src/core/tar.ts";
import { writeTar } from "../../src/core/tar-write.ts";

const bytes = (text: string) => new TextEncoder().encode(text);
const limits = { maxBytes: 1024 * 1024, maxEntries: 100 };

async function read(tar: Uint8Array): Promise<Record<string, string>> {
  const files = readTar(new Uint8Array(tar), limits);
  if (!(files instanceof Map)) {
    throw new Error(`not read: ${JSON.stringify(files)}`);
  }
  return Object.fromEntries(
    await Promise.all([...files].map(async ([path, blob]) => [path, await blob.text()] as const)),
  );
}

describe("writeTar", () => {
  test("writes what readTar reads back, long and non-ASCII names included", async () => {
    const long = `decks/talk/assets/${"deep/".repeat(30)}picture.txt`;
    const tar = writeTar(
      new Map([
        ["decks/talk/script.md", bytes("---\ntitle: Talk\n---\n")],
        [long, bytes("x".repeat(700))],
        ["decks/talk/assets/図.txt", bytes("図")],
        ["empty.txt", new Uint8Array()],
      ]),
    );
    expect(await read(tar)).toEqual({
      "decks/talk/script.md": "---\ntitle: Talk\n---\n",
      [long]: "x".repeat(700),
      "decks/talk/assets/図.txt": "図",
      "empty.txt": "",
    });
  });

  test("is the same bytes for the same files, in whatever order they come", () => {
    const a = writeTar(
      new Map([
        ["b.txt", bytes("b")],
        ["a.txt", bytes("a")],
      ]),
    );
    const b = writeTar(
      new Map([
        ["a.txt", bytes("a")],
        ["b.txt", bytes("b")],
      ]),
    );
    expect(a).toEqual(b);
    expect(a.byteLength % 512).toBe(0);
  });

  test("is read by the system's tar", async () => {
    const tar = writeTar(
      new Map([
        ["a/one.txt", bytes("one")],
        [`a/${"n".repeat(120)}.txt`, bytes("two")],
      ]),
    );
    const proc = Bun.spawn(["tar", "-tvf", "-"], { stdin: tar, stdout: "pipe", stderr: "pipe" });
    const [out, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
    expect(code).toBe(0);
    expect(out).toContain("a/one.txt");
    expect(out).toContain(`a/${"n".repeat(120)}.txt`);
  });
});
