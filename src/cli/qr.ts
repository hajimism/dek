/**
 * A QR code for a short URL, drawn in the terminal: byte mode, error correction level M,
 * versions 1 to 10 (up to 213 bytes). dekc needs one only for `--remote`'s pairing link, which
 * is far shorter, so it carries its own encoder rather than a dependency. It follows ISO/IEC
 * 18004 as laid out by Project Nayuki's reference implementation.
 */

/** Rows of modules, `true` for dark, without the quiet zone around them. */
export type QrMatrix = boolean[][];

type Position = readonly [x: number, y: number];

interface Version {
  readonly number: number;
  /** Data and error correction codewords together. */
  readonly codewords: number;
  readonly eccPerBlock: number;
  readonly blocks: number;
  /** Alignment pattern centers, the same on both axes. */
  readonly alignment: readonly number[];
}

/** Level M only. */
const VERSIONS: readonly Version[] = [
  { number: 1, codewords: 26, eccPerBlock: 10, blocks: 1, alignment: [] },
  { number: 2, codewords: 44, eccPerBlock: 16, blocks: 1, alignment: [6, 18] },
  { number: 3, codewords: 70, eccPerBlock: 26, blocks: 1, alignment: [6, 22] },
  { number: 4, codewords: 100, eccPerBlock: 18, blocks: 2, alignment: [6, 26] },
  { number: 5, codewords: 134, eccPerBlock: 24, blocks: 2, alignment: [6, 30] },
  { number: 6, codewords: 172, eccPerBlock: 16, blocks: 4, alignment: [6, 34] },
  { number: 7, codewords: 196, eccPerBlock: 18, blocks: 4, alignment: [6, 22, 38] },
  { number: 8, codewords: 242, eccPerBlock: 22, blocks: 4, alignment: [6, 24, 42] },
  { number: 9, codewords: 292, eccPerBlock: 22, blocks: 5, alignment: [6, 26, 46] },
  { number: 10, codewords: 346, eccPerBlock: 26, blocks: 5, alignment: [6, 28, 50] },
];

/** `mask` fixes the mask pattern, for tests; otherwise the one with the lowest penalty wins. */
export function qrMatrix(text: string, options: { mask?: number } = {}): QrMatrix {
  const bytes = [...new TextEncoder().encode(text)];
  const version = smallestVersion(bytes.length);
  const grid = new Grid(version);
  grid.drawCodewords(withErrorCorrection(dataCodewords(bytes, version), version));
  const mask = options.mask ?? lowestPenaltyMask(grid);
  grid.applyMask(mask);
  grid.drawFormatBits(mask);
  return grid.modules;
}

function smallestVersion(byteCount: number): Version {
  const version = VERSIONS.find(
    (candidate) => 4 + countBits(candidate) + byteCount * 8 <= dataCapacity(candidate) * 8,
  );
  if (!version) {
    throw new Error(`text too long for a QR code: ${byteCount} bytes`);
  }
  return version;
}

function dataCapacity(version: Version): number {
  return version.codewords - version.eccPerBlock * version.blocks;
}

/** Width of byte mode's character count field. */
function countBits(version: Version): number {
  return version.number < 10 ? 8 : 16;
}

function dataCodewords(bytes: readonly number[], version: Version): number[] {
  const capacity = dataCapacity(version);
  const segment = [
    ...bitsOf(0b0100, 4),
    ...bitsOf(bytes.length, countBits(version)),
    ...bytes.flatMap((byte) => bitsOf(byte, 8)),
  ];
  const terminated = [...segment, ...bitsOf(0, Math.min(4, capacity * 8 - segment.length))];
  const bits = [...terminated, ...bitsOf(0, (8 - (terminated.length % 8)) % 8)];
  const words = range(0, bits.length / 8).map((i) =>
    bits.slice(i * 8, i * 8 + 8).reduce((word, bit) => (word << 1) | bit, 0),
  );
  const padding = range(words.length, capacity).map((i) =>
    (i - words.length) % 2 === 0 ? 0xec : 0x11,
  );
  return [...words, ...padding];
}

/** The low `length` bits of `value`, most significant first. */
function bitsOf(value: number, length: number): number[] {
  return range(0, length).map((i) => (value >>> (length - 1 - i)) & 1);
}

/** Splits the data into blocks, appends each block's Reed-Solomon codewords, and interleaves. */
function withErrorCorrection(data: readonly number[], version: Version): number[] {
  const blocks = splitBlocks(data, version);
  const divisor = rsDivisor(version.eccPerBlock);
  return [...interleave(blocks), ...interleave(blocks.map((block) => rsRemainder(block, divisor)))];
}

/** The short blocks come first; the rest hold one more data codeword each. */
function splitBlocks(data: readonly number[], version: Version): number[][] {
  const shortBlocks = version.blocks - (version.codewords % version.blocks);
  const shortLength = Math.floor(version.codewords / version.blocks) - version.eccPerBlock;
  return range(0, version.blocks).map((i) => {
    const start = i * shortLength + Math.max(0, i - shortBlocks);
    return data.slice(start, start + shortLength + (i < shortBlocks ? 0 : 1));
  });
}

/** The first codeword of every block, then every second, and so on; short blocks run out first. */
function interleave(blocks: ReadonlyArray<readonly number[]>): number[] {
  const longest = Math.max(0, ...blocks.map((block) => block.length));
  return range(0, longest).flatMap((i) => blocks.flatMap((block) => block[i] ?? []));
}

/** Multiplication in GF(2^8) modulo the QR field's polynomial, 0x11d. */
function gfMultiply(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

/** The generator polynomial of the given degree, highest power first, its leading 1 left out. */
function rsDivisor(degree: number): number[] {
  let coefficients: number[] = range(0, degree).map((i) => (i === degree - 1 ? 1 : 0));
  let root = 1;
  for (let i = 0; i < degree; i++) {
    const previous = coefficients;
    coefficients = previous.map((c, j) => gfMultiply(c, root) ^ (previous[j + 1] ?? 0));
    root = gfMultiply(root, 0x02);
  }
  return coefficients;
}

function rsRemainder(data: readonly number[], divisor: readonly number[]): number[] {
  let remainder = divisor.map(() => 0);
  for (const byte of data) {
    const [lead = 0, ...rest] = remainder;
    const factor = byte ^ lead;
    remainder = divisor.map((coefficient, i) => (rest[i] ?? 0) ^ gfMultiply(coefficient, factor));
  }
  return remainder;
}

/**
 * Appends the BCH check bits that format and version information carry, computed by
 * long division by `generator`, a polynomial of the given degree.
 */
function withBch(data: number, degree: number, generator: number): number {
  let remainder = data;
  for (let i = 0; i < degree; i++) {
    remainder = (remainder << 1) ^ ((remainder >>> (degree - 1)) * generator);
  }
  return (data << degree) | remainder;
}

type MaskPattern = (x: number, y: number) => boolean;

const MASKS: readonly MaskPattern[] = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

function maskPattern(mask: number): MaskPattern {
  const pattern = MASKS[mask];
  if (!pattern) {
    throw new RangeError(`no QR mask ${mask}; masks run from 0 to 7`);
  }
  return pattern;
}

class Grid {
  readonly size: number;
  readonly modules: QrMatrix;
  /** Function modules, which neither data nor masks touch. */
  private readonly reserved: boolean[][];

  constructor(private readonly version: Version) {
    this.size = version.number * 4 + 17;
    this.modules = square(this.size);
    this.reserved = square(this.size);
    // Later patterns overwrite earlier ones where they cross, as the standard draws them.
    this.drawTimingPatterns();
    this.drawFinderPatterns();
    this.drawAlignmentPatterns();
    // Reserve the format areas now; drawFormatBits fills them for each mask.
    this.drawFormatBits(0);
    this.drawVersionInfo();
  }

  private setFunction(x: number, y: number, dark: boolean): void {
    setCell(this.modules, x, y, dark);
    setCell(this.reserved, x, y, true);
  }

  private isReserved(x: number, y: number): boolean {
    return this.reserved[y]?.[x] === true;
  }

  private drawTimingPatterns(): void {
    for (let i = 0; i < this.size; i++) {
      this.setFunction(6, i, i % 2 === 0);
      this.setFunction(i, 6, i % 2 === 0);
    }
  }

  /** Each finder comes with its light separator, which runs off the edge and is clipped there. */
  private drawFinderPatterns(): void {
    const far = this.size - 4;
    for (const [x, y] of [
      [3, 3],
      [far, 3],
      [3, far],
    ] as const) {
      this.drawRings(x, y, 4, (ring) => ring !== 2 && ring !== 4);
    }
  }

  private drawAlignmentPatterns(): void {
    for (const [x, y] of alignmentCenters(this.version.alignment)) {
      this.drawRings(x, y, 2, (ring) => ring !== 1);
    }
  }

  /** Paints the square of `radius` around a center, choosing each ring's color by its distance. */
  private drawRings(cx: number, cy: number, radius: number, dark: (ring: number) => boolean): void {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        this.setFunction(cx + dx, cy + dy, dark(Math.max(Math.abs(dx), Math.abs(dy))));
      }
    }
  }

  /** Level M is 00, so the format data is just the mask. */
  drawFormatBits(mask: number): void {
    const bits = withBch(mask, 10, 0x537) ^ 0x5412;
    for (const copy of formatPositions(this.size)) {
      for (const [i, [x, y]] of copy.entries()) {
        this.setFunction(x, y, ((bits >>> i) & 1) === 1);
      }
    }
    // The one module that is always dark.
    this.setFunction(8, this.size - 8, true);
  }

  /** Versions 7 and up spell out their number in two 6x3 blocks by the far finders. */
  private drawVersionInfo(): void {
    if (this.version.number < 7) {
      return;
    }
    const bits = withBch(this.version.number, 12, 0x1f25);
    for (let i = 0; i < 18; i++) {
      const dark = ((bits >>> i) & 1) === 1;
      const a = this.size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      this.setFunction(a, b, dark);
      this.setFunction(b, a, dark);
    }
  }

  /** Modules past the last codeword are the remainder bits, left light. */
  drawCodewords(codewords: readonly number[]): void {
    const bits = codewords.flatMap((word) => bitsOf(word, 8));
    const free = placementOrder(this.size).filter(([x, y]) => !this.isReserved(x, y));
    for (const [i, [x, y]] of free.entries()) {
      setCell(this.modules, x, y, bits[i] === 1);
    }
  }

  /** XORs the mask in, so applying it twice takes it out again. */
  applyMask(mask: number): void {
    const pattern = maskPattern(mask);
    this.modules.forEach((row, y) => {
      row.forEach((dark, x) => {
        if (!this.isReserved(x, y) && pattern(x, y)) {
          row[x] = !dark;
        }
      });
    });
  }
}

function square(size: number): boolean[][] {
  return range(0, size).map(() => new Array<boolean>(size).fill(false));
}

/** Writes outside the grid are dropped, which is what clips a finder's separator. */
function setCell(rows: boolean[][], x: number, y: number, value: boolean): void {
  const row = rows[y];
  if (row && x >= 0 && x < row.length) {
    row[x] = value;
  }
}

/** Every pairing of the centers, except the three corners the finders already occupy. */
function alignmentCenters(centers: readonly number[]): Position[] {
  const first = centers[0];
  const last = centers.at(-1);
  const finders = [
    [first, first],
    [first, last],
    [last, first],
  ];
  return centers
    .flatMap((x) => centers.map((y): Position => [x, y]))
    .filter(([x, y]) => !finders.some(([fx, fy]) => fx === x && fy === y));
}

/** Where each of the 15 format bits goes, least significant first, in each of its two copies. */
function formatPositions(size: number): ReadonlyArray<readonly Position[]> {
  const byFirstFinder: Position[] = [
    ...range(0, 6).map((i): Position => [8, i]),
    [8, 7],
    [8, 8],
    [7, 8],
    ...range(9, 15).map((i): Position => [14 - i, 8]),
  ];
  const byOtherFinders: Position[] = [
    ...range(0, 8).map((i): Position => [size - 1 - i, 8]),
    ...range(8, 15).map((i): Position => [8, size - 15 + i]),
  ];
  return [byFirstFinder, byOtherFinders];
}

/**
 * The zigzag the codeword bits follow: two-module columns from the right edge, alternately
 * upward and downward, skipping the column of the vertical timing pattern.
 */
function placementOrder(size: number): Position[] {
  const rights = range(0, (size - 1) / 2)
    .map((i) => size - 1 - i * 2)
    .map((right) => (right <= 6 ? right - 1 : right));
  return rights.flatMap((right, i) =>
    range(0, size).flatMap((vert): Position[] => {
      const y = i % 2 === 0 ? size - 1 - vert : vert;
      return [
        [right, y],
        [right - 1, y],
      ];
    }),
  );
}

/** Tries every mask; the first of any tied for the lowest penalty wins. */
function lowestPenaltyMask(grid: Grid): number {
  const penalties = MASKS.map((_pattern, mask) => {
    grid.applyMask(mask);
    grid.drawFormatBits(mask);
    const score = penalty(grid.modules);
    grid.applyMask(mask);
    return score;
  });
  return penalties.indexOf(Math.min(...penalties));
}

type ReadonlyMatrix = ReadonlyArray<readonly boolean[]>;

/** The standard's penalty: long runs, 2x2 blocks, finder look-alikes, and dark balance. */
function penalty(matrix: ReadonlyMatrix): number {
  const columns = matrix.map((_row, x) => matrix.map((row) => row[x] === true));
  const lines = [...matrix, ...columns];
  return (
    sum(lines.map((line) => runPenalty(line) + finderLikePenalty(line))) +
    blockPenalty(matrix) +
    balancePenalty(matrix)
  );
}

/** A run of five or more modules of one color costs its length less two. */
function runPenalty(line: readonly boolean[]): number {
  return sum(
    runLengths(line)
      .filter((run) => run >= 5)
      .map((run) => run - 2),
  );
}

function runLengths(line: readonly boolean[]): number[] {
  const runs: number[] = [];
  let previous: boolean | undefined;
  for (const dark of line) {
    runs.push(dark === previous ? (runs.pop() ?? 0) + 1 : 1);
    previous = dark;
  }
  return runs;
}

/** 1:1:3:1:1 with four light modules on one side, which a reader could take for a finder. */
function finderLikePenalty(line: readonly boolean[]): number {
  const text = line.map((dark) => (dark ? "1" : "0")).join("");
  return 40 * sum(["10111010000", "00001011101"].map((pattern) => occurrences(text, pattern)));
}

/** Overlapping ones count too. */
function occurrences(text: string, pattern: string): number {
  let count = 0;
  for (let from = text.indexOf(pattern); from >= 0; from = text.indexOf(pattern, from + 1)) {
    count++;
  }
  return count;
}

/** Every 2x2 square of one color, overlapping ones included, costs three. */
function blockPenalty(matrix: ReadonlyMatrix): number {
  let blocks = 0;
  for (const [y, row] of matrix.entries()) {
    const below = matrix[y + 1] ?? [];
    for (const [x, dark] of row.entries()) {
      if (row[x + 1] === dark && below[x] === dark && below[x + 1] === dark) {
        blocks++;
      }
    }
  }
  return blocks * 3;
}

/** Ten for each whole five percent the share of dark modules strays from half. */
function balancePenalty(matrix: ReadonlyMatrix): number {
  const modules = matrix.flat();
  const percent = (modules.filter(Boolean).length * 100) / modules.length;
  return Math.floor(Math.abs(percent - 50) / 5) * 10;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/** The integers from `from` up to, but not including, `to`. */
function range(from: number, to: number): number[] {
  return Array.from({ length: Math.max(0, to - from) }, (_, i) => from + i);
}

/**
 * The code in half blocks, two rows of modules per line, inside the four-module quiet zone a
 * reader needs. With color it is black on white whatever the terminal's theme, since a phone
 * reads a light-on-dark code less reliably.
 */
export function renderQr(matrix: QrMatrix, options: { color: boolean }): string {
  const quiet = 4;
  const size = matrix.length + quiet * 2;
  // Outside the matrix is the quiet zone, including the row past the bottom when size is odd.
  const dark = (x: number, y: number): boolean => matrix[y - quiet]?.[x - quiet] === true;
  return range(0, Math.ceil(size / 2))
    .map((row) => {
      const y = row * 2;
      const line = range(0, size)
        .map((x) => halfBlock(dark(x, y), dark(x, y + 1)))
        .join("");
      return options.color ? `\x1b[38;5;16;48;5;231m${line}\x1b[0m` : line;
    })
    .join("\n");
}

function halfBlock(top: boolean, bottom: boolean): string {
  if (top) {
    return bottom ? "█" : "▀";
  }
  return bottom ? "▄" : " ";
}
