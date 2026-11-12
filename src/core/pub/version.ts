import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { MAX_VERSION_BYTES, type SlideMap, type VersionFile } from "../../pub/protocol.ts";
import { loadConfig } from "../config.ts";
import { renderDeckDocument } from "../document.ts";
import { DekError } from "../error.ts";
import type { PlaywrightRunner } from "../playwright.ts";
import { pluginPages } from "../plugin-host.ts";
import type { Project, ProjectDeck } from "../resolve.ts";
import { requireInside, writeInside } from "../safe-fs.ts";
import { arrivalShots, coverShot } from "../shot/still.ts";
import { slideMap } from "../slide-map.ts";
import { writeTar } from "../tar-write.ts";

/**
 * What one version of a deck on dek.pub is made of, built from the project as it is: three builds
 * of the talk, for who may read how much of its script; its source; the first slide's picture;
 * and a picture of each slide as it arrives. Each is kept under the deck's `.cache/pub/`, as it
 * was sent.
 */

type PreparedFile = {
  field: VersionFile;
  bytes: Uint8Array<ArrayBuffer>;
  type: string;
  sha256: string;
};

export type PreparedVersion = {
  files: PreparedFile[];
  /** Each slide's picture as it arrives, by slug; undefined without Playwright. */
  shots: Array<{ slug: string; bytes: Uint8Array<ArrayBuffer>; sha256: string }> | undefined;
  /** The public build's map, which places the article and the comments. */
  slideMap: SlideMap;
};

type Target = { project: Project; deck: ProjectDeck };

export async function prepareVersion(
  { project, deck }: Target,
  options: {
    playerScript: string;
    /** The pages of the plugins dek ships, compiled, by name, as a build takes them. */
    pluginScripts: Record<string, string>;
    runner?: PlaywrightRunner;
  },
): Promise<PreparedVersion> {
  const scratch = join(deck.dir, ".cache", "pub");
  const script = options.playerScript;
  const plugins = pluginPages(project.root, deck.dir, options.pluginScripts);
  const page = (target: { public?: true; script?: false }) =>
    new TextEncoder().encode(
      renderDeckDocument(deck, {
        playerScript: script,
        plugins,
        target: { kind: "build", ...target },
      }),
    );
  const files: PreparedFile[] = [
    prepared("full", page({}), "text/html"),
    prepared("public", page({ public: true }), "text/html"),
    prepared("bare", page({ public: true, script: false }), "text/html"),
    prepared("source", deckSource({ project, deck }), "application/x-tar"),
  ];
  const cover = await coverShot(deck, options.runner);
  if (cover !== undefined) {
    files.push(prepared("cover", new Uint8Array(readFileSync(cover)), "image/png"));
  }
  const arrived = await arrivalShots(deck, options.runner);
  for (const file of files) {
    writeInside(join(scratch, fileName(file.field)), file.bytes, project.root);
  }
  return {
    files,
    shots: arrived?.map((shot) => {
      const bytes = new Uint8Array(readFileSync(shot.path));
      return { slug: shot.slug, bytes, sha256: sha256(bytes) };
    }),
    slideMap: slideMap(deck, "public", "audience"),
  };
}

/** The file a field is kept as, and sent as: its extension says its type. */
export function fileName(field: VersionFile): string {
  return field === "source" ? "source.tar" : field === "cover" ? "cover.png" : `${field}.html`;
}

function prepared(field: VersionFile, bytes: Uint8Array<ArrayBuffer>, type: string): PreparedFile {
  return { field, bytes, type, sha256: sha256(bytes) };
}

export function sha256(bytes: Uint8Array): string {
  return new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
}

/**
 * The deck's source as one tar that is the same bytes for the same files: every file under
 * `decks/<deck>/` but `dist/`, `.cache/`, and the names that start with a dot, such as
 * `.DS_Store`, and `effective-config.json`, the dek.toml values in effect when it was published.
 */
export function deckSource({ project, deck }: Target): Uint8Array<ArrayBuffer> {
  const files = new Map<string, Uint8Array>();
  let size = 0;
  const walk = (rel: string) => {
    const dir = requireInside(join(deck.dir, rel), project.root);
    for (const name of readdirSync(dir)) {
      if (name.startsWith(".") || (rel === "" && name === "dist")) {
        continue;
      }
      const path = rel === "" ? name : `${rel}/${name}`;
      const real = requireInside(join(deck.dir, path), project.root);
      const stat = statSync(real, { throwIfNoEntry: false });
      if (stat === undefined) {
        throw new DekError(`${relative(project.root, join(deck.dir, path))} is missing`, {
          path: join(deck.dir, path),
          hint: "it is a symlink to nothing; remove it, or copy the file it meant in its place",
        });
      }
      if (stat.isDirectory()) {
        walk(path);
        continue;
      }
      size += stat.size;
      if (size > MAX_VERSION_BYTES) {
        throw new DekError(
          `deck "${deck.name}" is larger than dek.pub takes, ${mebibytes(MAX_VERSION_BYTES)} MiB`,
          { path: deck.dir, hint: "check the deck's assets for files the talk does not show" },
        );
      }
      files.set(`decks/${deck.name}/${path}`, new Uint8Array(readFileSync(real)));
    }
  };
  walk("");
  const config = loadConfig(project.configPath);
  files.set(
    "effective-config.json",
    new TextEncoder().encode(`${JSON.stringify(config, null, 2)}\n`),
  );
  return writeTar(files);
}

/**
 * Refuse a version larger than dek.pub takes, before anything is sent: every file and picture
 * together, with the largest named, since each build carries the pictures the slides show.
 */
export function requireUploadable(
  version: Pick<PreparedVersion, "files" | "shots">,
  deckDir: string,
): void {
  const parts = [
    ...version.files.map((file) => ({ name: fileName(file.field), bytes: file.bytes.byteLength })),
    ...(version.shots ?? []).map((shot) => ({
      name: `the picture of ${shot.slug}`,
      bytes: shot.bytes.byteLength,
    })),
  ];
  const total = parts.reduce((sum, part) => sum + part.bytes, 0);
  if (total <= MAX_VERSION_BYTES) {
    return;
  }
  const largest = [...parts].sort((a, b) => b.bytes - a.bytes).slice(0, 3);
  throw new DekError(
    `the version is ${mebibytes(total)} MiB, and dek.pub takes ${mebibytes(MAX_VERSION_BYTES)} MiB at most`,
    {
      path: deckDir,
      hint: `make the deck's assets smaller, such as its pictures and videos, which each build carries; the largest parts are ${largest.map((part) => `${part.name} (${mebibytes(part.bytes)} MiB)`).join(", ")}`,
    },
  );
}

function mebibytes(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(1).replace(/\.0$/, "");
}
