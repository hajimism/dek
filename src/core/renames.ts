import { join } from "node:path";
import { z } from "zod";
import { Rename } from "../pub/protocol.ts";
import { DekError } from "./error.ts";
import { readSourceIfExists, writeInside } from "./safe-fs.ts";
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
  const plan = planRename(root, deck, from, to, now);
  writeInside(plan.path, plan.after, root);
  return plan.rename;
}

/**
 * The file with the rename added, and the file as it is (undefined while there is none), for a
 * caller that writes it as one step of a larger change and takes it back with the rest. Reading
 * it first means a file that does not read refuses the change before anything is written.
 */
export function planRename(
  root: string,
  deck: string,
  from: string,
  to: string,
  now: Date = new Date(),
): { path: string; before: string | undefined; after: string; rename: Rename } {
  const path = renamesPath(root);
  const before = readSourceIfExists(path, root);
  const file = parseRenamesFile(path, before);
  const rename = { from, to, at: now.toISOString() };
  const decks = { ...file.decks, [deck]: [...(file.decks[deck] ?? []), rename] };
  return { path, before, after: `${JSON.stringify({ version: 1, decks }, null, 2)}\n`, rename };
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
