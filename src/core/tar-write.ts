/**
 * A tar that is the same bytes for the same files: entries in path order, each with mode 0644, no
 * owner, and the time 0, so two runs over one source hash the same, whatever the clock or the
 * file system says. Bun.Archive stamps each entry with the time it ran. A name longer than a
 * ustar header holds goes in a pax `path` record before its entry, which `readTar` reads.
 */

const BLOCK = 512;
const NAME_BYTES = 100;

const encoder = new TextEncoder();

export function writeTar(files: ReadonlyMap<string, Uint8Array>): Uint8Array<ArrayBuffer> {
  const parts: Uint8Array[] = [];
  for (const path of [...files.keys()].sort(byBytes)) {
    const data = files.get(path) ?? new Uint8Array();
    const name = encoder.encode(path);
    if (name.byteLength > NAME_BYTES) {
      const record = paxRecord("path", path);
      parts.push(header("././@PaxHeader", record.byteLength, "x"), padded(record));
    }
    parts.push(header(name.byteLength > NAME_BYTES ? "" : path, data.byteLength, "0"));
    parts.push(padded(data));
  }
  // The end: two blocks of zeros.
  parts.push(new Uint8Array(BLOCK * 2));
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.byteLength;
  }
  return out;
}

/** Paths compared as their UTF-8 bytes, an order no locale changes. */
function byBytes(a: string, b: string): number {
  const x = encoder.encode(a);
  const y = encoder.encode(b);
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) {
      return d;
    }
  }
  return x.length - y.length;
}

/** A pax record, `<length> <key>=<value>\n`, whose length counts its own digits. */
function paxRecord(key: string, value: string): Uint8Array {
  const body = encoder.encode(` ${key}=${value}\n`).byteLength;
  let length = body + String(body).length;
  if (String(length).length !== String(body).length) {
    length = body + String(length).length;
  }
  return encoder.encode(`${length} ${key}=${value}\n`);
}

function padded(data: Uint8Array): Uint8Array {
  const out = new Uint8Array(Math.ceil(data.byteLength / BLOCK) * BLOCK);
  out.set(data);
  return out;
}

function header(name: string, size: number, type: string): Uint8Array {
  const block = new Uint8Array(BLOCK);
  const put = (offset: number, text: string) => block.set(encoder.encode(text), offset);
  put(0, name);
  put(100, octal(0o644, 8));
  put(108, octal(0, 8));
  put(116, octal(0, 8));
  put(124, octal(size, 12));
  put(136, octal(0, 12));
  // The checksum counts its own field as spaces.
  put(148, "        ");
  put(156, type);
  put(257, "ustar\0");
  put(263, "00");
  const sum = block.reduce((total, byte) => total + byte, 0);
  put(148, `${sum.toString(8).padStart(6, "0")}\0 `);
  return block;
}

/** `value` in octal, zero-padded to fill `width` with its NUL. */
function octal(value: number, width: number): string {
  return `${value.toString(8).padStart(width - 1, "0")}\0`;
}
