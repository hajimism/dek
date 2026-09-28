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

// Hashes of the exact modules the encoder drew before it was split into stages, so a refactor
// that changes a single module, or which mask wins, fails here rather than only at a reader.
describe("qrMatrix output", () => {
  const cases: ReadonlyArray<readonly [string, string, number | undefined, string]> = [
    ["empty", "", undefined, "c30ac51df3031a0d"],
    ["one letter", "a", undefined, "e8ab680854e4019c"],
    ["multibyte", "日本語のデッキ", undefined, "ce0d09fb5952c516"],
    ["pairing link", PAIR_URL, undefined, "6d9ac9d4c3193b03"],
    ...(
      [
        [14, "d244d01a20cc9119"],
        [26, "c86dfdae17c1d657"],
        [42, "1e94a0e6d24f3c2b"],
        [62, "d719bb5644f05623"],
        [84, "d76336e3f179d4d7"],
        [106, "948a5c9f906a84a1"],
        [122, "fec985a2b7f5cd9a"],
        [152, "b712f44dfac497f8"],
        [180, "ce441539abacd0b1"],
        [213, "047cd05494b92677"],
      ] as const
    ).map(([n, hash]) => [`version-full ${n} bytes`, sample(n), undefined, hash] as const),
    ...(
      [
        [
          26,
          [
            "38d2593acd8a3ccd",
            "1eb8565e3e76b415",
            "c86dfdae17c1d657",
            "c804f92f3c16e76a",
            "a3659dd2b4b27a5e",
            "18173b65b5732f1f",
            "e66526e046abefee",
            "d069c637ef1fd952",
          ],
        ],
        [
          122,
          [
            "33bd9a44ccd65455",
            "82dde7eee411aeb7",
            "45dc6f94510b8468",
            "f1a63f6c1f4c5bbf",
            "5615198ebeba5ac2",
            "fec985a2b7f5cd9a",
            "de472881e94906b6",
            "cec9306667471557",
          ],
        ],
        [
          213,
          [
            "af9144e9d84ac5cf",
            "b6ece67c09ce94db",
            "8549424ce1f1499f",
            "52ad896a31c144df",
            "2efe605bc679fd97",
            "047cd05494b92677",
            "fe267549cf6d6c55",
            "12a654373df0fb94",
          ],
        ],
      ] as const
    ).flatMap(([n, hashes]) =>
      hashes.map((hash, mask) => [`${n} bytes, mask ${mask}`, sample(n), mask, hash] as const),
    ),
  ];

  test.each(cases)("%s", (_name, text, mask, hash) => {
    expect(matrixHash(qrMatrix(text, mask === undefined ? {} : { mask }))).toBe(hash);
  });

  test("renders the same text", () => {
    expect(textHash(renderQr(qrMatrix(PAIR_URL), { color: false }))).toBe("72eebf0b05396245");
    expect(textHash(renderQr(qrMatrix(PAIR_URL), { color: true }))).toBe("90ad419ccb2d76ab");
    expect(textHash(renderQr(qrMatrix("a"), { color: false }))).toBe("6910f03abadbd837");
  });
});

/** Printable ASCII that varies byte to byte, so every data bit pattern gets exercised. */
function sample(length: number): string {
  return Array.from({ length }, (_, i) => String.fromCharCode(33 + ((i * 31 + 7) % 94))).join("");
}

function matrixHash(matrix: boolean[][]): string {
  return textHash(matrix.map((row) => row.map((dark) => (dark ? "1" : "0")).join("")).join("\n"));
}

function textHash(text: string): string {
  return new Bun.CryptoHasher("sha256").update(text).digest("hex").slice(0, 16);
}

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
