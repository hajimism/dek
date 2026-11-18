import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { zipFiles } from "../../src/core/zip.ts";
import { withTempDir } from "../helpers/fs.ts";
import { readZip } from "../helpers/zip.ts";

const text = (value: string) => new TextEncoder().encode(value);

/** How each entry of an archive is packed, by its path: 0 stored, 8 deflated. */
function methods(zip: Uint8Array): Record<string, number> {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const found: Record<string, number> = {};
  for (let at = 0; at + 4 <= zip.length && view.getUint32(at, true) === 0x04034b50; ) {
    const nameLength = view.getUint16(at + 26, true);
    const name = new TextDecoder().decode(zip.subarray(at + 30, at + 30 + nameLength));
    found[name] = view.getUint16(at + 8, true);
    at += 30 + nameLength + view.getUint16(at + 28, true) + view.getUint32(at + 18, true);
  }
  return found;
}

describe("zipFiles", () => {
  test("holds each file under its path, in order, and reads back the same", () => {
    const zip = zipFiles([
      { path: "[Content_Types].xml", data: text("<Types/>") },
      { path: "ppt/slides/slide1.xml", data: text("<p:sld>日本語</p:sld>") },
      { path: "empty", data: new Uint8Array() },
    ]);
    const files = readZip(zip);
    expect([...files.keys()]).toEqual(["[Content_Types].xml", "ppt/slides/slide1.xml", "empty"]);
    expect(new TextDecoder().decode(files.get("ppt/slides/slide1.xml"))).toBe(
      "<p:sld>日本語</p:sld>",
    );
    expect(files.get("empty")).toHaveLength(0);
  });

  test("deflates what that makes smaller, and stores a picture and what it would not", () => {
    const runs = text("<a:r><a:rPr/><a:t>字</a:t></a:r>".repeat(200));
    const zip = zipFiles([
      { path: "ppt/slides/slide1.xml", data: runs },
      // A picture is compressed already, whatever its bytes are here.
      { path: "ppt/media/image1.png", data: runs },
      { path: "short.xml", data: text("<a/>") },
    ]);
    expect(methods(zip)).toEqual({
      "ppt/slides/slide1.xml": 8,
      "ppt/media/image1.png": 0,
      "short.xml": 0,
    });
    expect(zip.length).toBeLessThan(runs.length * 1.2);
    const files = readZip(zip);
    expect(files.get("ppt/slides/slide1.xml")).toEqual(runs);
    expect(files.get("ppt/media/image1.png")).toEqual(runs);
  });

  test("makes the same bytes of the same files", () => {
    const files = [{ path: "a.xml", data: text("<a>".repeat(100)) }];
    expect(zipFiles(files)).toEqual(zipFiles(files));
  });

  test("is an archive unzip accepts", async () => {
    await withTempDir(async (dir) => {
      const path = join(dir, "a.zip");
      await Bun.write(
        path,
        zipFiles([
          { path: "a/b.txt", data: text("hello") },
          { path: "a/c.xml", data: text("<c>".repeat(100)) },
        ]),
      );
      const tested = Bun.spawnSync(["unzip", "-t", path]);
      expect(tested.exitCode).toBe(0);
      expect(tested.stdout.toString()).toContain("No errors detected");
    });
  });
});
