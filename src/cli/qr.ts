/**
 * A QR code for a short URL, drawn in the terminal: byte mode, error correction level M,
 * versions 1 to 10 (up to 213 bytes). dek needs one only for `--remote`'s pairing link, which
 * is far shorter, so it carries its own encoder rather than a dependency. It follows ISO/IEC
 * 18004 as laid out by Project Nayuki's reference implementation.
 */

/** Level M: total codewords, error correction codewords per block, and blocks, by version. */
const VERSIONS: ReadonlyArray<readonly [number, number, number]> = [
  [26, 10, 1],
  [44, 16, 1],
  [70, 26, 1],
  [100, 18, 2],
  [134, 24, 2],
  [172, 16, 4],
  [196, 18, 4],
  [242, 22, 4],
  [292, 22, 5],
  [346, 26, 5],
];

const ALIGNMENT: ReadonlyArray<readonly number[]> = [
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
];

/** Rows of modules, `true` for dark, without the quiet zone around them. */
export type QrMatrix = boolean[][];

/** `mask` fixes the mask pattern, for tests; otherwise the one with the lowest penalty wins. */
export function qrMatrix(text: string, options: { mask?: number } = {}): QrMatrix {
  const bytes = [...new TextEncoder().encode(text)];
  const version = VERSIONS.findIndex(([total, ecc, blocks], index) => {
    const countBits = index + 1 < 10 ? 8 : 16;
    return 4 + countBits + bytes.length * 8 <= (total - ecc * blocks) * 8;
  });
  if (version < 0) {
    throw new Error(`text too long for a QR code: ${bytes.length} bytes`);
  }
  const [total, ecc, blocks] = VERSIONS[version] as readonly [number, number, number];
  const data = dataCodewords(bytes, version + 1, total - ecc * blocks);
  const codewords = interleave(data, total, ecc, blocks);
  const grid = new Grid(version + 1);
  grid.drawFunctionPatterns();
  grid.drawCodewords(codewords);
  let best: { mask: number; penalty: number } | undefined;
  for (const mask of options.mask === undefined ? [0, 1, 2, 3, 4, 5, 6, 7] : [options.mask]) {
    grid.applyMask(mask);
    grid.drawFormatBits(mask);
    const penalty = grid.penalty();
    if (!best || penalty < best.penalty) {
      best = { mask, penalty };
    }
    grid.applyMask(mask);
  }
  const mask = (best as { mask: number }).mask;
  grid.applyMask(mask);
  grid.drawFormatBits(mask);
  return grid.modules;
}

function dataCodewords(bytes: number[], version: number, capacity: number): number[] {
  const bits: number[] = [];
  const push = (value: number, length: number): void => {
    for (let i = length - 1; i >= 0; i--) {
      bits.push((value >>> i) & 1);
    }
  };
  push(0b0100, 4);
  push(bytes.length, version < 10 ? 8 : 16);
  for (const byte of bytes) {
    push(byte, 8);
  }
  push(0, Math.min(4, capacity * 8 - bits.length));
  push(0, (8 - (bits.length % 8)) % 8);
  const words: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    words.push(bits.slice(i, i + 8).reduce((word, bit) => (word << 1) | bit, 0));
  }
  for (let pad = 0xec; words.length < capacity; pad ^= 0xec ^ 0x11) {
    words.push(pad);
  }
  return words;
}

/** Splits the data into blocks, appends each block's Reed-Solomon codewords, and interleaves. */
function interleave(data: number[], total: number, ecc: number, blocks: number): number[] {
  const shortBlocks = blocks - (total % blocks);
  const shortData = Math.floor(total / blocks) - ecc;
  const divisor = rsDivisor(ecc);
  const parts: Array<{ data: number[]; ecc: number[] }> = [];
  for (let i = 0, at = 0; i < blocks; i++) {
    const length = shortData + (i < shortBlocks ? 0 : 1);
    const block = data.slice(at, at + length);
    at += length;
    parts.push({ data: block, ecc: rsRemainder(block, divisor) });
  }
  const result: number[] = [];
  for (let i = 0; i <= shortData; i++) {
    for (const part of parts) {
      if (i < part.data.length) {
        result.push(part.data[i] as number);
      }
    }
  }
  for (let i = 0; i < ecc; i++) {
    for (const part of parts) {
      result.push(part.ecc[i] as number);
    }
  }
  return result;
}

function gfMultiply(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

function rsDivisor(degree: number): number[] {
  const result = new Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      result[j] = gfMultiply(result[j] as number, root);
      if (j + 1 < degree) {
        result[j] = (result[j] as number) ^ (result[j + 1] as number);
      }
    }
    root = gfMultiply(root, 0x02);
  }
  return result;
}

function rsRemainder(data: number[], divisor: number[]): number[] {
  const result = divisor.map(() => 0);
  for (const byte of data) {
    const factor = byte ^ (result.shift() as number);
    result.push(0);
    divisor.forEach((coefficient, i) => {
      result[i] = (result[i] as number) ^ gfMultiply(coefficient, factor);
    });
  }
  return result;
}

const MASKS: ReadonlyArray<(x: number, y: number) => boolean> = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

class Grid {
  readonly size: number;
  readonly modules: QrMatrix;
  private readonly fixed: boolean[][];

  constructor(private readonly version: number) {
    this.size = version * 4 + 17;
    this.modules = Array.from({ length: this.size }, () =>
      new Array<boolean>(this.size).fill(false),
    );
    this.fixed = Array.from({ length: this.size }, () => new Array<boolean>(this.size).fill(false));
  }

  private set(x: number, y: number, dark: boolean): void {
    (this.modules[y] as boolean[])[x] = dark;
    (this.fixed[y] as boolean[])[x] = true;
  }

  drawFunctionPatterns(): void {
    for (let i = 0; i < this.size; i++) {
      this.set(6, i, i % 2 === 0);
      this.set(i, 6, i % 2 === 0);
    }
    for (const [x, y] of [
      [3, 3],
      [this.size - 4, 3],
      [3, this.size - 4],
    ] as const) {
      for (let dy = -4; dy <= 4; dy++) {
        for (let dx = -4; dx <= 4; dx++) {
          const distance = Math.max(Math.abs(dx), Math.abs(dy));
          const xx = x + dx;
          const yy = y + dy;
          if (xx >= 0 && xx < this.size && yy >= 0 && yy < this.size) {
            this.set(xx, yy, distance !== 2 && distance !== 4);
          }
        }
      }
    }
    const positions = ALIGNMENT[this.version - 1] as readonly number[];
    const last = positions.length - 1;
    positions.forEach((x, i) => {
      positions.forEach((y, j) => {
        if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) {
          return;
        }
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            this.set(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
          }
        }
      });
    });
    // Reserve the format areas now; drawFormatBits fills them for each mask.
    this.drawFormatBits(0);
    if (this.version >= 7) {
      let rem = this.version;
      for (let i = 0; i < 12; i++) {
        rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
      }
      const bits = (this.version << 12) | rem;
      for (let i = 0; i < 18; i++) {
        const dark = ((bits >>> i) & 1) === 1;
        const a = this.size - 11 + (i % 3);
        const b = Math.floor(i / 3);
        this.set(a, b, dark);
        this.set(b, a, dark);
      }
    }
  }

  /** Level M is 00, so the format data is just the mask. */
  drawFormatBits(mask: number): void {
    let rem = mask;
    for (let i = 0; i < 10; i++) {
      rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    }
    const bits = ((mask << 10) | rem) ^ 0x5412;
    const bit = (i: number): boolean => ((bits >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) {
      this.set(8, i, bit(i));
    }
    this.set(8, 7, bit(6));
    this.set(8, 8, bit(7));
    this.set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) {
      this.set(14 - i, 8, bit(i));
    }
    for (let i = 0; i < 8; i++) {
      this.set(this.size - 1 - i, 8, bit(i));
    }
    for (let i = 8; i < 15; i++) {
      this.set(8, this.size - 15 + i, bit(i));
    }
    this.set(8, this.size - 8, true);
  }

  drawCodewords(codewords: number[]): void {
    let i = 0;
    for (let right = this.size - 1; right >= 1; right -= 2) {
      if (right === 6) {
        right = 5;
      }
      for (let vert = 0; vert < this.size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? this.size - 1 - vert : vert;
          if (!this.fixed[y]?.[x] && i < codewords.length * 8) {
            (this.modules[y] as boolean[])[x] =
              (((codewords[i >>> 3] as number) >>> (7 - (i & 7))) & 1) === 1;
            i++;
          }
        }
      }
    }
  }

  /** XORs the mask in, so applying it twice takes it out again. */
  applyMask(mask: number): void {
    const test = MASKS[mask] as (x: number, y: number) => boolean;
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        if (!this.fixed[y]?.[x] && test(x, y)) {
          const row = this.modules[y] as boolean[];
          row[x] = !row[x];
        }
      }
    }
  }

  /** The standard's penalty: long runs, 2x2 blocks, finder look-alikes, and dark balance. */
  penalty(): number {
    const at = (x: number, y: number): boolean => (this.modules[y] as boolean[])[x] as boolean;
    let result = 0;
    const lines: boolean[][] = [];
    for (let i = 0; i < this.size; i++) {
      lines.push(this.modules[i] as boolean[]);
      lines.push(this.modules.map((row) => row[i] as boolean));
    }
    for (const line of lines) {
      let run = 1;
      for (let i = 1; i <= line.length; i++) {
        if (i < line.length && line[i] === line[i - 1]) {
          run++;
          continue;
        }
        if (run >= 5) {
          result += run - 2;
        }
        run = 1;
      }
      const text = line.map((dark) => (dark ? "1" : "0")).join("");
      for (const pattern of ["10111010000", "00001011101"]) {
        for (let from = text.indexOf(pattern); from >= 0; from = text.indexOf(pattern, from + 1)) {
          result += 40;
        }
      }
    }
    let dark = 0;
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        if (at(x, y)) {
          dark++;
        }
        if (
          x + 1 < this.size &&
          y + 1 < this.size &&
          at(x, y) === at(x + 1, y) &&
          at(x, y) === at(x, y + 1) &&
          at(x, y) === at(x + 1, y + 1)
        ) {
          result += 3;
        }
      }
    }
    const percent = (dark * 100) / (this.size * this.size);
    return result + Math.floor(Math.abs(percent - 50) / 5) * 10;
  }
}

/**
 * The code in half blocks, two rows of modules per line, inside the four-module quiet zone a
 * reader needs. With color it is black on white whatever the terminal's theme, since a phone
 * reads a light-on-dark code less reliably.
 */
export function renderQr(matrix: QrMatrix, options: { color: boolean }): string {
  const quiet = 4;
  const size = matrix.length + quiet * 2;
  const dark = (x: number, y: number): boolean => matrix[y - quiet]?.[x - quiet] === true;
  const lines: string[] = [];
  for (let y = 0; y < size; y += 2) {
    let line = "";
    for (let x = 0; x < size; x++) {
      const top = dark(x, y);
      const bottom = y + 1 < size && dark(x, y + 1);
      line += top ? (bottom ? "█" : "▀") : bottom ? "▄" : " ";
    }
    lines.push(options.color ? `\x1b[38;5;16;48;5;231m${line}\x1b[0m` : line);
  }
  return lines.join("\n");
}
