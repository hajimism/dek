import { DEK_TOML_KEYS } from "./config.ts";
import { splitLines } from "./lines.ts";
import { Frontmatter } from "./schema.ts";
import { suggest } from "./suggest.ts";

/** A key dek does not read, where it is, and the known key it most likely meant. */
export type UnknownKey = { key: string; line: number; suggestion?: string };

/**
 * Keys in dek.toml that dek ignores. Parsing drops unknown keys without a word, so a typo such
 * as `latin_per_minut` would silently leave the default in place.
 */
export function unknownTomlKeys(source: string): UnknownKey[] {
  const { keys, openTables } = DEK_TOML_KEYS;
  const tables = new Set(keys.map((key) => key.split(".")[0] ?? key));
  const found: UnknownKey[] = [];
  const seen = new Set<string>();
  for (const { path, line } of tomlKeyLines(source)) {
    const [head = ""] = path;
    if (openTables.includes(head)) {
      continue;
    }
    // A table header names a table; only an unknown table is worth a word.
    const key = path.join(".");
    const known = path.length === 1 ? tables.has(head) || keys.includes(key) : keys.includes(key);
    if (known || seen.has(key)) {
      continue;
    }
    seen.add(key);
    found.push(withSuggestion({ key, line }, keys));
  }
  return found;
}

/** Top-level frontmatter keys dek ignores, with 1-based lines in script.md. */
export function unknownFrontmatterKeys(source: string): UnknownKey[] {
  const known = Object.keys(Frontmatter.shape);
  const lines = splitLines(source);
  if (lines[0]?.trim() !== "---") {
    return [];
  }
  const found: UnknownKey[] = [];
  for (let index = 1; index < lines.length; index++) {
    const text = lines[index] ?? "";
    if (text.trim() === "---") {
      break;
    }
    const key = text.match(/^([A-Za-z_][\w-]*)\s*:/)?.[1];
    if (key && !known.includes(key)) {
      found.push(withSuggestion({ key, line: index + 1 }, known));
    }
  }
  return found;
}

export const FRONTMATTER_KEYS: readonly string[] = Object.keys(Frontmatter.shape);

function withSuggestion(entry: UnknownKey, known: string[]): UnknownKey {
  const suggestion = suggest(entry.key, known);
  return suggestion ? { ...entry, suggestion } : entry;
}

/**
 * Each key or table header in a TOML file as a dotted path, with its 1-based line. It reads
 * `[table]`, `key =`, and `a.b =` lines and skips comments and multi-line strings; that is all
 * dek.toml holds.
 */
function tomlKeyLines(source: string): Array<{ path: string[]; line: number }> {
  const out: Array<{ path: string[]; line: number }> = [];
  let table: string[] = [];
  let multiline: string | undefined;
  for (const [index, text] of splitLines(source).entries()) {
    if (multiline) {
      if (text.includes(multiline)) {
        multiline = undefined;
      }
      continue;
    }
    const header = text.match(/^\s*\[{1,2}\s*([^\]]+?)\s*\]{1,2}\s*(?:#.*)?$/);
    if (header?.[1]) {
      table = splitDotted(header[1]);
      out.push({ path: table, line: index + 1 });
      continue;
    }
    const pair = text.match(
      /^\s*((?:"[^"]*"|'[^']*'|[\w-]+)(?:\s*\.\s*(?:"[^"]*"|'[^']*'|[\w-]+))*)\s*=\s*(.*)$/,
    );
    if (pair?.[1]) {
      out.push({ path: [...table, ...splitDotted(pair[1])], line: index + 1 });
      const value = pair[2] ?? "";
      const quote = value.startsWith('"""') ? '"""' : value.startsWith("'''") ? "'''" : undefined;
      if (quote && !value.slice(3).includes(quote)) {
        multiline = quote;
      }
    }
  }
  return out;
}

function splitDotted(path: string): string[] {
  return (path.match(/"[^"]*"|'[^']*'|[^.\s]+/g) ?? []).map((part) =>
    part.replace(/^["']|["']$/g, ""),
  );
}
