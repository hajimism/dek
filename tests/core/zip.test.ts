import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { zipStored } from "../../src/core/zip.ts";
import { withTempDir } from "../helpers/fs.ts";
import { readZip } from "../helpers/zip.ts";

const text = (value: string) => new TextEncoder().encode(value);

describe("zipStored", () => {
  test("holds each file under its path, in order, and reads back the same", () => {
    const zip = zipStored([
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

  test("is an archive unzip accepts", async () => {
    await withTempDir(async (dir) => {
      const path = join(dir, "a.zip");
      await Bun.write(path, zipStored([{ path: "a/b.txt", data: text("hello") }]));
      const tested = Bun.spawnSync(["unzip", "-t", path]);
      expect(tested.exitCode).toBe(0);
      expect(tested.stdout.toString()).toContain("No errors detected");
    });
  });
});
