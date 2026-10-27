import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { loadConfig } from "./config.ts";
import { DekError } from "./error.ts";
import { licenseText } from "./licenses.ts";
import { type DistOptions, distFile } from "./path.ts";
import { keepsInDeck, LICENSE_NAMES, MAX_SNAPSHOT_BYTES } from "./ref.ts";
import { isRefDeckName, REF_DECK_NAME_RULE } from "./ref-name.ts";
import { followInside, requireInside, writeInside } from "./safe-fs.ts";

/**
 * A deck handed over as a file, to be read as a ref by someone who cannot reach it on GitHub:
 * a gzipped tar of a project that holds only that deck, under a folder named for it. The deck
 * keeps what `dekc ref` keeps of a repository; the project's dek.toml goes empty, so the
 * sender's refs and voice settings stay home. Its LICENSE is the one `packLicense` picks.
 */
export async function packDeck(
  project: { root: string },
  deck: { name: string; dir: string },
  options: { maxBytes?: number } = {},
): Promise<Uint8Array> {
  if (!isRefDeckName(deck.name)) {
    throw new DekError(`deck "${deck.name}" cannot be read as a ref by that name`, {
      path: deck.dir,
      hint: `${REF_DECK_NAME_RULE}; rename the deck's folder, e.g. to 2026-10-talk, and pack it again`,
    });
  }
  // Each file by its path in the pack and where it really is, measured before any is read.
  const sources: Array<readonly [string, string]> = deckFiles(deck.dir, project.root).map(
    (path) =>
      [`decks/${deck.name}/${path}`, requireInside(join(deck.dir, path), project.root)] as const,
  );
  const license = packLicense(project.root);
  if (license?.path) {
    sources.push([license.name, license.path]);
  }
  const maxBytes = options.maxBytes ?? MAX_SNAPSHOT_BYTES;
  const size = sources.reduce((sum, [, real]) => sum + statSync(real).size, 0);
  if (size > maxBytes) {
    throw new DekError(
      `deck "${deck.name}" is larger than a ref keeps, ${maxBytes / 1024 / 1024} MB`,
      {
        path: deck.dir,
        hint: "a deck to read as a model should be far smaller; check its assets",
      },
    );
  }
  const files = new Map<string, Uint8Array>([["dek.toml", new Uint8Array()]]);
  for (const [path, real] of sources) {
    files.set(path, readFileSync(real));
  }
  if (license?.text !== undefined) {
    files.set(license.name, new TextEncoder().encode(license.text));
  }
  const entries: Record<string, Uint8Array> = {};
  for (const [path, bytes] of files) {
    entries[`${deck.name}/${path}`] = bytes;
  }
  return new Bun.Archive(entries, { compress: "gzip" }).bytes();
}

/**
 * The LICENSE a pack carries: the legal code `[pack] license` names, which says what the reader
 * may do with a deck handed over on purpose; else the project's own LICENSE file; else none.
 */
function packLicense(
  root: string,
):
  | { name: string; text: string; path?: undefined }
  | { name: string; path: string; text?: undefined }
  | undefined {
  const id = loadConfig(join(root, "dek.toml")).pack?.license;
  if (id) {
    return { name: "LICENSE", text: licenseText(id) };
  }
  const name = LICENSE_NAMES.find((file) => isFile(join(root, file), root));
  return name ? { name, path: requireInside(join(root, name), root) } : undefined;
}

/** Said to the sender, who can fix it, when a pack would go out with no license. */
const NO_PACK_LICENSE =
  'the pack carries no license, so its reader is told to ask you before reusing it; add `[pack] license = "CC0-1.0"` to dek.toml to let them reuse it freely, or put a LICENSE at the project root';

/** `dekc pack`: write the deck's pack as dist/<deck>.tgz. */
export async function writePack(
  project: { root: string },
  deck: { name: string; dir: string },
  options: DistOptions = {},
): Promise<{ outPath: string; warnings: string[] }> {
  const bytes = await packDeck(project, deck);
  const outPath = distFile(project, deck, "tgz", options);
  writeInside(outPath, bytes, project.root);
  return { outPath, warnings: packLicense(project.root) ? [] : [NO_PACK_LICENSE] };
}

/** What `deckFiles` looks at in the deck's own folder; dist/, .cache/, and voice/ are not read. */
const DECK_TOP = new Set(["script.md", "theme.css", "slides", "assets"]);

/**
 * The deck's files a ref keeps, relative to the deck, in a stable order. A file or folder whose
 * name starts with a dot stays behind; a link dek would not follow anywhere else is an error.
 */
function deckFiles(deckDir: string, root: string): string[] {
  const found: string[] = [];
  const walk = (rel: string) => {
    const dir = requireInside(join(deckDir, rel), root);
    for (const name of readdirSync(dir).sort()) {
      if (name.startsWith(".") || (rel === "" && !DECK_TOP.has(name))) {
        continue;
      }
      const path = rel === "" ? name : `${rel}/${name}`;
      const real = requireInside(join(deckDir, path), root);
      if (!existsSync(real)) {
        throw new DekError(`${relative(root, join(deckDir, path))} is missing`, {
          path: join(deckDir, path),
          hint: "it is a symlink to nothing; remove it, or copy the file it meant in its place",
        });
      }
      if (statSync(real).isDirectory()) {
        walk(path);
      } else if (keepsInDeck(path)) {
        found.push(path);
      }
    }
  };
  walk("");
  return found;
}

function isFile(path: string, root: string): boolean {
  const real = followInside(path, root);
  try {
    return real !== undefined && statSync(real).isFile();
  } catch {
    return false;
  }
}
