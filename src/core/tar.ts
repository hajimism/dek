/**
 * dek's reader for a tar from someone else, a pack or GitHub's tarball of a repository (ADR 31).
 * It reads the tar where it lies in memory, and each file is a copy of the bytes the tar stores
 * for it, so nothing comes out larger than the tar that was counted on the way in. It reads what
 * git, GNU tar, bsdtar, and Bun write: ustar headers, POSIX or GNU, with pax `x` and `g` headers
 * and GNU `L` and `K` long names before an entry. Anything else, a sparse file, a device, a header
 * that does not add up, or a second archive after the first, is refused rather than guessed at.
 */

const BLOCK = 512;

// A byte order mark at the start of a name is part of the name, as Bun.Archive kept it.
const decoder = new TextDecoder("utf-8", { ignoreBOM: true });

/** The longest name dek reads, from a GNU long-name header or a pax record: PATH_MAX. */
const MAX_NAME_BYTES = 4096;

/** Headers that describe the entry after them, or the whole archive, rather than an entry. */
const META_TYPES = new Set(["x", "g", "L", "K"]);

/** Regular files: `0`, the old `\0`, and `7`, which tar writes and reads as a regular file. */
const FILE_TYPES = new Set(["0", "\0", "7"]);

/** Folders and links, which hold no data; Bun leaves links out, and so does dek. */
const EMPTY_TYPES = new Set(["5", "1", "2"]);

/** pax keys that make an entry a sparse file, whose bytes are not the ones the tar stores. */
const SPARSE_KEY = /^(?:GNU\.sparse\.|SCHILY\.realsize$|SUN\.holesdata$)/;

/**
 * Why dek will not read a tar: its entries declare more than it may hold, it is not a tar at all,
 * or it `holds` something dek does not read, named so its sender can find it, such as "a sparse
 * file (`t/big`)".
 */
export type TarRefusal =
  | { kind: "too large" }
  | { kind: "not a tar" }
  | { kind: "holds"; what: string };

/**
 * The regular files of `tar` by the path it gives them, or why there are none. It may hold
 * `maxEntries` headers at most, and its entries may declare `maxBytes` in all. The tar must end
 * with a block of zeros, and only zeros may follow it, so a second archive after the first is
 * refused rather than half read. A file whose name's last segment starts with `._`, the
 * AppleDouble file in which macOS's tar keeps another file's extended attributes, is left out, as
 * Bun.Archive left it out.
 */
export function readTar(
  tar: Uint8Array<ArrayBuffer>,
  { maxBytes, maxEntries }: { maxBytes: number; maxEntries: number },
): Map<string, Blob> | TarRefusal {
  // A first block that is no tar header at all, rather than a damaged one, is not a tar.
  if (tar.byteLength < BLOCK || parseHeader(tar.subarray(0, BLOCK)) === NOT_USTAR) {
    return { kind: "not a tar" };
  }
  const files = new Map<string, Blob>();
  let declared = 0;
  let entries = 0;
  // What the headers before an entry say about it; they apply to that entry and no other.
  let pending: Pending = NOTHING_PENDING;
  let offset = 0;
  while (offset + BLOCK <= tar.byteLength) {
    const block = tar.subarray(offset, offset + BLOCK);
    if (isZero(block)) {
      if (pending !== NOTHING_PENDING) {
        return holds("a pax or long-name header with no entry after it");
      }
      return afterEnd(tar.subarray(offset)) ?? files;
    }
    entries += 1;
    if (entries > maxEntries) {
      return holds(`more than ${maxEntries.toLocaleString("en-US")} entries`);
    }
    const header = parseHeader(block);
    if (typeof header === "string") {
      return holds(header);
    }
    const meta = META_TYPES.has(header.type);
    const paxSize = meta ? undefined : pending.pax?.get("size");
    const size = paxSize === undefined ? header.size : decimal(paxSize);
    // The last of a pax path and a GNU long name names the entry; an empty one leaves the header's.
    const path = meta ? header.name : pending.name || header.name;
    if (size === undefined) {
      return holds(`a pax size that does not read (${shown(path)})`);
    }
    // Short of what it declares before larger than the limit: a kilobyte that declares 200 MB is cut
    // short, not 200 MB.
    const start = offset + BLOCK;
    if (start + size > tar.byteLength) {
      return holds(`an entry cut short (${shown(path)})`);
    }
    declared += size;
    if (declared > maxBytes) {
      return { kind: "too large" };
    }
    const data = tar.subarray(start, start + size);
    offset = start + Math.ceil(size / BLOCK) * BLOCK;

    if (meta) {
      const read = readMeta(header, data, pending);
      if (typeof read === "string") {
        return holds(read);
      }
      pending = read;
      continue;
    }
    pending = NOTHING_PENDING;
    if (path.includes("\0")) {
      return holds(`a name with a NUL in it (${shown(path)})`);
    }
    if (FILE_TYPES.has(header.type)) {
      if (path.endsWith("/")) {
        return holds(`a file named like a folder (${shown(path)})`);
      }
      if (!path.slice(path.lastIndexOf("/") + 1).startsWith("._")) {
        files.set(path, new Blob([data]));
      }
    } else if (!EMPTY_TYPES.has(header.type)) {
      return holds(
        `${KIND_OF[header.type] ?? `an entry of type ${shown(header.type)}`} (${shown(path)})`,
      );
    } else if (size !== 0) {
      return holds(
        `${header.type === "5" ? "a folder" : "a link"} that declares data (${shown(path)})`,
      );
    }
  }
  return holds("a tar with no end");
}

/** The entry types dek names when it refuses one; any other is named by its type. */
const KIND_OF: Record<string, string> = {
  S: "a sparse file",
  "3": "a device",
  "4": "a device",
  "6": "a FIFO",
};

function holds(what: string): TarRefusal {
  return { kind: "holds", what };
}

/** What follows the end of the tar, when it is not only zeros: another archive, or other data. */
function afterEnd(rest: Uint8Array): TarRefusal | undefined {
  const start = rest.findIndex((byte) => byte !== 0);
  if (start < 0) {
    return undefined;
  }
  const block = rest.subarray(start - (start % BLOCK), start - (start % BLOCK) + BLOCK);
  return holds(
    typeof parseHeader(block) === "string"
      ? "data after the end of the tar"
      : "a second archive after the first",
  );
}

/**
 * A name from the tar as dek may print it: on one line, with no control or format character, such
 * as one that moves the cursor or turns text around, no longer than 80 characters, in backticks.
 * It is cut before anything else, so a long name costs no more than a short one.
 */
function shown(name: string): string {
  const head = Array.from(name.slice(0, 200));
  const cut = head.length > 80 ? `${head.slice(0, 79).join("")}…` : head.join("");
  return `\`${cut.replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}`]/gu, "\uFFFD")}\``;
}

/** What the pax and GNU headers before an entry said: its pax records, its name, which were seen. */
type Pending = {
  pax?: Map<string, string>;
  name?: string;
  longName?: true;
  longLink?: true;
};

const NOTHING_PENDING: Pending = {};

/**
 * What a pax or GNU header adds to what is pending for the next entry, or what is wrong with it:
 * it does not read, names a path too long or repeats one already pending, or marks a sparse file.
 * A global `g` header applies to nothing dek reads; it may come only between entries.
 */
function readMeta(header: Header, data: Uint8Array, pending: Pending): Pending | string {
  const twice = `two pax or long-name headers before one entry (${shown(header.name)})`;
  if (header.type === "L" || header.type === "K") {
    const end = data.indexOf(0);
    if ((end < 0 ? data.byteLength : end) > MAX_NAME_BYTES) {
      return tooLong(data);
    }
    if (header.type === "K") {
      return pending.longLink ? twice : { ...pending, longLink: true };
    }
    const name = text(data);
    return pending.longName ? twice : { ...pending, longName: true, name: name || pending.name };
  }
  const records = paxRecords(data);
  if (typeof records === "string") {
    return records || `pax records that do not read (${shown(header.name)})`;
  }
  if ([...records.keys()].some((key) => SPARSE_KEY.test(key))) {
    const name = records.get("GNU.sparse.name") ?? records.get("path") ?? header.name;
    return `a sparse file (${shown(name)})`;
  }
  if (header.type === "g") {
    return pending === NOTHING_PENDING
      ? pending
      : "a pax global header between a header and its entry";
  }
  if (pending.pax) {
    return twice;
  }
  return { ...pending, pax: records, name: records.get("path") || pending.name };
}

/** A name longer than dek reads, shown by its start. */
function tooLong(bytes: Uint8Array): string {
  return `a name longer than ${MAX_NAME_BYTES} bytes (${shown(decoder.decode(bytes.subarray(0, 400)))})`;
}

type Header = { type: string; name: string; size: number };

const NOT_USTAR = "a header that is neither ustar nor GNU tar";

/**
 * A header block, or what is wrong with it, unless it is a ustar header as POSIX (`ustar\0`
 * `00`) or GNU (`ustar  \0`) writes it, with a checksum that adds up and a size in octal. A
 * POSIX header's prefix goes before its name; a GNU header keeps other fields there.
 */
function parseHeader(block: Uint8Array): Header | string {
  const magic = decoder.decode(block.subarray(257, 265));
  const posix = magic === "ustar\u000000";
  if (!posix && magic !== "ustar  \u0000" && !isZero(block)) {
    return NOT_USTAR;
  }
  const name = text(block.subarray(0, 100));
  const prefix = posix ? text(block.subarray(345, 500)) : "";
  const path = prefix === "" ? name : `${prefix}/${name}`;
  if (!checksumHolds(block)) {
    return `a header whose checksum does not add up (${shown(path)})`;
  }
  const size = octal(block.subarray(124, 136));
  if (size === undefined) {
    return `a header whose size does not read (${shown(path)})`;
  }
  return { type: String.fromCharCode(block[156] ?? 0), name: path, size };
}

/** An octal field: digits, after spaces if any, then only NULs or spaces. */
function octal(field: Uint8Array): number | undefined {
  const digits = /^ *([0-7]+)[ \0]*$/.exec(decoder.decode(field))?.[1];
  return digits === undefined ? undefined : Number.parseInt(digits, 8);
}

/** A pax number: decimal digits and nothing else. */
function decimal(value: string): number | undefined {
  return /^\d+$/.test(value) ? Number(value) : undefined;
}

/** The header's checksum against its bytes, summed as unsigned or as signed, as tar allows. */
function checksumHolds(block: Uint8Array): boolean {
  const stored = octal(block.subarray(148, 156));
  let unsigned = 0;
  let signed = 0;
  for (let index = 0; index < BLOCK; index++) {
    const value = index >= 148 && index < 156 ? 0x20 : (block[index] ?? 0);
    unsigned += value;
    signed += value > 127 ? value - 256 : value;
  }
  return stored === unsigned || stored === signed;
}

/** The pax records that name a path, which may be `MAX_NAME_BYTES` long at most. */
const NAME_KEYS = new Set(["path", "linkpath"]);

/**
 * pax records, `<length> <key>=<value>\n` each with the length in decimal digits, filling `data`
 * exactly, by key; otherwise what is wrong, a path too long or, as "", a record that does not read.
 */
function paxRecords(data: Uint8Array): Map<string, string> | string {
  const records = new Map<string, string>();
  let offset = 0;
  while (offset < data.byteLength) {
    const space = data.indexOf(0x20, offset);
    const digits = space < 0 ? "" : decoder.decode(data.subarray(offset, space));
    if (!/^[1-9]\d*$/.test(digits)) {
      return "";
    }
    const end = offset + Number(digits);
    if (end <= space + 1 || end > data.byteLength || data[end - 1] !== 0x0a) {
      return "";
    }
    const equals = data.subarray(0, end - 1).indexOf(0x3d, space + 1);
    if (equals <= space + 1) {
      return "";
    }
    const key = decoder.decode(data.subarray(space + 1, equals));
    const value = data.subarray(equals + 1, end - 1);
    if (NAME_KEYS.has(key) && value.byteLength > MAX_NAME_BYTES) {
      return tooLong(value);
    }
    records.set(key, decoder.decode(value));
    offset = end;
  }
  return records;
}

/** A field's text up to its first NUL. */
function text(field: Uint8Array): string {
  const end = field.indexOf(0);
  return decoder.decode(end < 0 ? field : field.subarray(0, end));
}

function isZero(bytes: Uint8Array): boolean {
  return bytes.every((byte) => byte === 0);
}
