import { describe, expect, test } from "bun:test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { qrMatrix, renderQr } from "../../src/cli/qr.ts";
import { withTempDir } from "../helpers/fs.ts";

const PAIR_URL = "http://192.168.100.200:54321/decks/why-dek/presenter?pair=abcdefghijkmnpqr";

describe("qrMatrix", () => {
  test("picks the smallest version that holds the text", () => {
    expect(qrMatrix("a")).toHaveLength(21);
    expect(qrMatrix(PAIR_URL)).toHaveLength(37);
    expect(qrMatrix("x".repeat(213))).toHaveLength(57);
    expect(() => qrMatrix("x".repeat(214))).toThrow("too long");
  });

  test("draws the three finder patterns and the timing lines", () => {
    const m = qrMatrix(PAIR_URL);
    const size = m.length;
    for (const [x, y] of [
      [0, 0],
      [size - 7, 0],
      [0, size - 7],
    ] as const) {
      expect(m[y + 3]?.slice(x, x + 7)).toEqual([true, false, true, true, true, false, true]);
    }
    expect(m[6]?.slice(8, size - 8)).toEqual(
      Array.from({ length: size - 16 }, (_, i) => i % 2 === 0),
    );
  });
});

describe("renderQr", () => {
  test("draws two rows per line in half blocks inside a four-module quiet zone", () => {
    const lines = renderQr(qrMatrix("a"), { color: false }).split("\n");
    expect(lines).toHaveLength(Math.ceil((21 + 8) / 2));
    expect(lines.every((line) => line.length === 29)).toBe(true);
    expect(lines[0]).toBe(" ".repeat(29));
    expect(lines[2]?.slice(4, 11)).toBe("█▀▀▀▀▀█");
  });

  test("paints black on white with color, whatever the terminal's theme", () => {
    const [line] = renderQr(qrMatrix("a"), { color: true }).split("\n");
    expect(line?.startsWith("\x1b[38;5;16;48;5;231m")).toBe(true);
    expect(line?.endsWith("\x1b[0m")).toBe(true);
  });
});

// A real reader: CoreImage on macOS. Linux CI has none, and the structure tests above still run.
const canDecode = process.platform === "darwin" && Bun.which("swift") !== null;

describe.if(canDecode)("a QR reader", () => {
  test("decodes every version and every mask", async () => {
    const cases = [
      ...["a", "日本語のデッキ", PAIR_URL, "x".repeat(120), "x".repeat(213)].map((text) => ({
        text,
        mask: undefined as number | undefined,
      })),
      ...[0, 1, 2, 3, 4, 5, 6, 7].map((mask) => ({ text: PAIR_URL, mask })),
    ];
    await withTempDir(async (dir) => {
      const paths = await Promise.all(
        cases.map(async ({ text, mask }, i) => {
          const path = join(dir, `${String(i).padStart(2, "0")}.png`);
          await writeFile(path, png(qrMatrix(text, mask === undefined ? {} : { mask })));
          return path;
        }),
      );
      const proc = Bun.spawn(
        ["swift", join(import.meta.dir, "..", "helpers", "qr-decode.swift"), ...paths],
        { stdout: "pipe", stderr: "pipe" },
      );
      const out = await new Response(proc.stdout).text();
      expect(await proc.exited).toBe(0);
      expect(out.trimEnd().split("\n")).toEqual(cases.map((entry) => entry.text));
    });
  }, 120_000);
});

/** A grayscale PNG of the code, eight pixels a module, with its quiet zone. */
function png(matrix: boolean[][]): Buffer {
  const scale = 8;
  const quiet = 4;
  const side = (matrix.length + quiet * 2) * scale;
  const raw = Buffer.alloc((side + 1) * side);
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const dark = matrix[Math.floor(y / scale) - quiet]?.[Math.floor(x / scale) - quiet];
      raw[y * (side + 1) + 1 + x] = dark ? 0 : 255;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(side, 0);
  header.writeUInt32BE(side, 4);
  header[8] = 8;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function pngChunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function crc32(bytes: Buffer): number {
  let crc = ~0;
  for (const byte of bytes) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
  }
  return ~crc >>> 0;
}
