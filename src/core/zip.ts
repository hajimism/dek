import { deflateRawSync } from "node:zlib";

/** One file of an archive: its path inside it, with `/` between folders, and its bytes. */
export type ZipFile = { path: string; data: Uint8Array };

/** Pictures that are compressed already: deflating them again buys nothing. */
const PACKED = /\.(png|jpe?g|gif|webp)$/i;

/**
 * A ZIP archive of `files`, in order: each deflated where that makes it smaller, which XML's
 * repeated tags make it many times over, and stored as it is otherwise, as a picture is. Paths
 * are UTF-8, and the time is fixed, so the same files make the same bytes on the same Bun.
 */
export function zipFiles(files: readonly ZipFile[]): Uint8Array {
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.path);
    const deflated = PACKED.test(file.path)
      ? undefined
      : new Uint8Array(deflateRawSync(file.data, { level: 9 }));
    const packed = deflated && deflated.length < file.data.length ? deflated : file.data;
    const entry = {
      method: packed === file.data ? 0 : 8,
      crc: Bun.hash.crc32(file.data),
      packed: packed.length,
      size: file.data.length,
    };

    const local = new Uint8Array(30 + name.length);
    const head = new DataView(local.buffer);
    head.setUint32(0, 0x04034b50, true);
    writeCommon(head, 4, entry);
    head.setUint16(26, name.length, true);
    local.set(name, 30);
    locals.push(local, packed);

    const central = new Uint8Array(46 + name.length);
    const listed = new DataView(central.buffer);
    listed.setUint32(0, 0x02014b50, true);
    listed.setUint16(4, 20, true);
    writeCommon(listed, 6, entry);
    listed.setUint16(28, name.length, true);
    listed.setUint32(42, offset, true);
    central.set(name, 46);
    centrals.push(central);

    offset += local.length + packed.length;
  }
  const directorySize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const tail = new DataView(end.buffer);
  tail.setUint32(0, 0x06054b50, true);
  tail.setUint16(8, files.length, true);
  tail.setUint16(10, files.length, true);
  tail.setUint32(12, directorySize, true);
  tail.setUint32(16, offset, true);
  return concat([...locals, ...centrals, end]);
}

/** 1980-01-01 00:00, the earliest time a ZIP can say. */
const DOS_DATE = (0 << 9) | (1 << 5) | 1;

/**
 * What the local header and the central directory entry share, from the version needed on: no
 * flags but UTF-8 names, how it is packed, the fixed time, the CRC, and its size packed and not.
 */
function writeCommon(
  view: DataView,
  at: number,
  entry: { method: number; crc: number; packed: number; size: number },
) {
  view.setUint16(at, 20, true);
  view.setUint16(at + 2, 1 << 11, true);
  view.setUint16(at + 4, entry.method, true);
  view.setUint16(at + 6, 0, true);
  view.setUint16(at + 8, DOS_DATE, true);
  view.setUint32(at + 10, entry.crc, true);
  view.setUint32(at + 14, entry.packed, true);
  view.setUint32(at + 18, entry.size, true);
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}
