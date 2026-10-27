/** One tar header as written by hand, right or wrong as a test needs it. */
export type TarHeader = {
  name: string;
  /** The typeflag: "0" for a file, "x" for pax records, "S" for a GNU sparse file, … */
  type: string;
  /** The size field: a number as tar writes it, or the field's bytes as given. */
  size: number | string | Uint8Array;
  /** GNU (`ustar  \0`, the default) or POSIX (`ustar\0` `00`). */
  magic?: "gnu" | "posix";
  /** Bytes to set at an offset, such as a link's target or a GNU sparse map and real size. */
  fields?: Array<[offset: number, value: string]>;
  /** Write a checksum one off. */
  badChecksum?: boolean;
};

/** One tar entry: its header, then its data. */
export type TarEntry = Omit<TarHeader, "size"> & {
  data?: Uint8Array | string;
  /** The size the header declares, when it is not the data's. */
  size?: number;
};

const encoder = new TextEncoder();

/** A field's octal digits, zero padded and ended with NUL, as tar writes them. */
function tarOctal(value: number, width: number): string {
  return `${value.toString(8).padStart(width - 1, "0")}\0`;
}

/** pax records, each `<length> <key>=<value>\n` with the length, in bytes, counting itself. */
export function paxRecords(records: Record<string, string>): string {
  return Object.entries(records)
    .map(([key, value]) => {
      const body = ` ${key}=${value}\n`;
      let length = Buffer.byteLength(body) + 1;
      while (Buffer.byteLength(`${length}${body}`) !== length) {
        length += 1;
      }
      return `${length}${body}`;
    })
    .join("");
}

/** A header block with its checksum worked out. */
export function tarHeader(header: TarHeader): Uint8Array<ArrayBuffer> {
  const block = new Uint8Array(512);
  const put = (offset: number, value: string | Uint8Array) =>
    block.set(typeof value === "string" ? encoder.encode(value) : value, offset);
  put(0, header.name);
  put(100, tarOctal(0o644, 8));
  put(108, tarOctal(0, 8));
  put(116, tarOctal(0, 8));
  put(124, typeof header.size === "number" ? tarOctal(header.size, 12) : header.size);
  put(136, tarOctal(0, 12));
  block[156] = header.type.charCodeAt(0);
  if (header.magic === "posix") {
    put(257, "ustar\u000000");
  } else {
    put(257, "ustar  \0");
  }
  for (const [offset, value] of header.fields ?? []) {
    put(offset, value);
  }
  block.fill(0x20, 148, 156);
  const sum = block.reduce((total, byte) => total + byte, 0) + (header.badChecksum ? 1 : 0);
  put(148, `${sum.toString(8).padStart(6, "0")}\0 `);
  return block;
}

/** Data padded with zeros to whole blocks. */
export function tarData(data: Uint8Array | string): Uint8Array<ArrayBuffer> {
  const bytes = typeof data === "string" ? encoder.encode(data) : data;
  const padded = new Uint8Array(Math.ceil(bytes.byteLength / 512) * 512);
  padded.set(bytes);
  return padded;
}

/** `count` blocks of zeros: two of them end a tar. */
export function zeroBlocks(count = 1): Uint8Array<ArrayBuffer> {
  return new Uint8Array(512 * count);
}

/** The parts one after another. */
export function joinBytes(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const joined = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.byteLength;
  }
  return joined;
}

/** A plain file entry: its header and its data. */
export function tarFile(name: string, data: string): Uint8Array<ArrayBuffer> {
  return joinBytes(
    tarHeader({ name, type: "0", size: encoder.encode(data).byteLength }),
    tarData(data),
  );
}

/** A GNU sparse `S` entry of one stored byte that libarchive fills out to `realsize` bytes. */
export function sparseEntry(name: string, realsize: number): Uint8Array<ArrayBuffer> {
  const header = tarHeader({
    name,
    type: "S",
    size: 1,
    fields: [
      [386, tarOctal(realsize - 1, 12)],
      [398, tarOctal(1, 12)],
      [483, tarOctal(realsize, 12)],
    ],
  });
  return joinBytes(header, tarData("x"));
}

/** A tar of `entries` with its checksums right and two zero blocks at the end. */
export function tarOf(entries: TarEntry[]): Uint8Array<ArrayBuffer> {
  const parts = entries.map((entry) => {
    const data =
      typeof entry.data === "string"
        ? encoder.encode(entry.data)
        : (entry.data ?? new Uint8Array());
    return joinBytes(tarHeader({ ...entry, size: entry.size ?? data.byteLength }), tarData(data));
  });
  return joinBytes(...parts, zeroBlocks(2));
}
