import { join } from "node:path";
import { z } from "zod";
import { Rename } from "../pub/protocol.ts";
import { DekError } from "./error.ts";
import { readSourceIfExists, removeInside, writeInside } from "./safe-fs.ts";
import { formatZodIssues } from "./zod.ts";

/**
 * The slugs `dekc mv` renamed, by deck, oldest first. A comment on dek.pub names its slide by
 * slug, so the next publish sends these and the server moves each comment to the slide's new
 * name. The file is committed with the project: a publish from another checkout sends the same.
 */
const RenamesFile = z.object({
  version: z.literal(1),
  decks: z.record(z.string(), z.array(Rename)),
});

type RenamesFile = z.infer<typeof RenamesFile>;

export function renamesPath(root: string): string {
  return join(root, ".dek", "renames.json");
}

/** Every rename recorded for `deck`, oldest first. */
export function readRenames(root: string, deck: string): Rename[] {
  return readRenamesFile(root).decks[deck] ?? [];
}

/** Record that `from` became `to` in `deck`. */
export function recordRename(
  root: string,
  deck: string,
  from: string,
  to: string,
  now: Date = new Date(),
): Rename {
  const record = renameRecord(root, deck, from, to, { now });
  record.apply();
  return { from, to, at: now.toISOString() };
}

/**
 * The record of one rename, for a caller that writes it as one step of a larger change and takes
 * it back with the rest. Making it reads the file, so a file that does not read refuses the change
 * before anything is written. `apply` reads it again and appends, so a record another `dekc mv`
 * wrote in between is kept; `undo` takes out only the entry `apply` added. With `once`, nothing
 * is added when the deck's last entry is already this rename.
 */
export function renameRecord(
  root: string,
  deck: string,
  from: string,
  to: string,
  options: { now?: Date; once?: boolean } = {},
): { path: string; apply(): void; undo(): void } {
  const path = renamesPath(root);
  readRenamesFile(root);
  const rename: Rename = { from, to, at: (options.now ?? new Date()).toISOString() };
  let added: { existed: boolean } | undefined;
  return {
    path,
    apply() {
      const existed = readSourceIfExists(path, root) !== undefined;
      const file = readRenamesFile(root);
      const entries = file.decks[deck] ?? [];
      const last = entries.at(-1);
      if (options.once && last?.from === from && last.to === to) {
        return;
      }
      writeRenamesFile(root, { ...file.decks, [deck]: [...entries, rename] });
      added = { existed };
    },
    undo() {
      if (!added) {
        return;
      }
      const file = readRenamesFile(root);
      const entries = [...(file.decks[deck] ?? [])];
      const index = entries.findLastIndex(
        (entry) => entry.from === rename.from && entry.to === rename.to && entry.at === rename.at,
      );
      if (index >= 0) {
        entries.splice(index, 1);
      }
      const { [deck]: _, ...others } = file.decks;
      const decks = entries.length > 0 ? { ...others, [deck]: entries } : others;
      if (!added.existed && Object.keys(decks).length === 0) {
        removeInside(path, root);
      } else {
        writeRenamesFile(root, decks);
      }
      added = undefined;
    },
  };
}

function writeRenamesFile(root: string, decks: RenamesFile["decks"]): void {
  writeInside(renamesPath(root), `${JSON.stringify({ version: 1, decks }, null, 2)}\n`, root);
}

function readRenamesFile(root: string): RenamesFile {
  const path = renamesPath(root);
  return parseRenamesFile(path, readSourceIfExists(path, root));
}

function parseRenamesFile(path: string, text: string | undefined): RenamesFile {
  if (text === undefined) {
    return { version: 1, decks: {} };
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw unreadable(path, error instanceof Error ? error.message : String(error));
  }
  const parsed = RenamesFile.safeParse(value);
  if (!parsed.success) {
    throw unreadable(path, formatZodIssues(parsed.error));
  }
  return parsed.data;
}

function unreadable(path: string, why: string): DekError {
  return new DekError(`.dek/renames.json does not read: ${why}`, {
    path,
    hint: "fix the JSON, or delete .dek/renames.json; comments on dek.pub then stay on the old slugs",
  });
}
