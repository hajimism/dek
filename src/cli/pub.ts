import { join } from "node:path";
import { z } from "zod";
import pkg from "../../package.json";
import { shotCommand } from "../core/annotations.ts";
import { type Diagnostic, hasErrors, type SkippedCheck } from "../core/diagnostic.ts";
import { DekError } from "../core/error.ts";
import { shellQuote } from "../core/escape.ts";
import { withFrontmatterKey } from "../core/frontmatter-key.ts";
import { PLAYWRIGHT_INSTALL, type PlaywrightRunner } from "../core/playwright.ts";
import { PubError, request, serverOrigin, UPLOAD_TIMEOUT_MS } from "../core/pub/client.ts";
import { asPending, awaitLogin, pendingLogin, startLogin } from "../core/pub/login.ts";
import { locateQuote } from "../core/pub/quote.ts";
import { forgetKey, type Key, readKey, readStoredKey } from "../core/pub/store.ts";
import { deckSource, fileName, prepareVersion, renamesSince, sha256 } from "../core/pub/version.ts";
import { readRenames } from "../core/renames.ts";
import { readSourceIfExists, writeInside } from "../core/safe-fs.ts";
import {
  CommentList,
  CommentPolicy,
  CommentRow,
  DeckStatus,
  Me,
  PROTOCOL_VERSION,
  PublishResult,
  paths,
  Reply,
  shotField,
  type VersionManifest,
  Visibility,
} from "../pub/protocol.ts";
import type { PubFields } from "./contract.ts";
import type { FlagValues } from "./flags.ts";
import { lintCommand } from "./lint.ts";
import type { ReadableDeck } from "./scope.ts";

type ShotsSkipped = { check: "shots"; reason: string; hint: string };

/** The contract's shape, with what lint found as core types it. */
type WithFindings<T> = T extends { diagnostics: unknown }
  ? Omit<T, "diagnostics" | "skipped"> & {
      diagnostics: Diagnostic[];
      skipped?: T extends { published: true } ? Array<SkippedCheck | ShotsSkipped> : SkippedCheck[];
    }
  : T;

/** What every `dekc pub` subcommand prints, by its action. */
export type PubResult = WithFindings<PubFields>;

type Flags = Pick<FlagValues, "server">;

/** `dekc pub <words>`, with --server as this run was given it, for a hint to run as written. */
function pubCommand(words: string, flags: Flags): string {
  return flags.server === undefined
    ? `dekc pub ${words}`
    : `dekc pub ${words} --server ${shellQuote(flags.server)}`;
}

/** The key to send to `origin`, or the error that says how to sign in. */
async function requireKey(origin: string, flags: Flags): Promise<Key> {
  const key = await readKey(origin);
  if (key === undefined) {
    throw new DekError(`not signed in to ${origin}`, {
      hint: `run \`${pubCommand("login", flags)}\`; in CI, set DEK_TOKEN to an API key`,
    });
  }
  return key;
}

/** The deck's ID on dek.pub, or the error that says to publish it first. */
function requireDeckId({ deck }: ReadableDeck, flags: Flags): string {
  const id = deck.deck.pub;
  if (id === undefined) {
    throw new DekError(`deck "${deck.name}" is not on dek.pub yet: script.md has no pub:`, {
      path: deck.scriptPath,
      hint: `run \`${pubCommand("publish", flags)}\` first; it writes pub: into script.md`,
    });
  }
  return id;
}

// ---------------------------------------------------------------------------------------------
// Signing in and out.

/**
 * `dekc pub login`. With a sign-in already waiting, wait for its approval; else ask for a code.
 * With `--json`, a new code is printed at once, for an agent to show a person, and the next run
 * waits; without it, the code goes to stderr and the same run waits.
 */
export async function loginCommand(flags: FlagValues): Promise<PubResult> {
  const origin = serverOrigin(flags.server);
  const waiting = pendingLogin(origin);
  const login = waiting ?? (await startLogin(origin));
  if (waiting === undefined && flags.json === true) {
    return {
      action: "login",
      server: origin,
      ...asPending(login),
      next: `${pubCommand("login", flags)} --json`,
    };
  }
  if (flags.json !== true) {
    const minutes = Math.max(1, Math.round((Date.parse(login.expiresAt) - Date.now()) / 60_000));
    process.stderr.write(
      `open ${login.url} and enter ${login.userCode} to sign in (the code works for ${minutes} min)\nwaiting for the approval...\n`,
    );
  }
  const signedIn = await awaitLogin(origin, login);
  return { action: "login", server: origin, ...signedIn };
}

/**
 * `dekc pub logout`: revoke the key login kept, then forget it, even when the server is away. A key
 * in DEK_TOKEN is the user's own, to unset.
 */
export async function logoutCommand(flags: FlagValues): Promise<PubResult> {
  const origin = serverOrigin(flags.server);
  const key = await readStoredKey(origin);
  let revoked = false;
  let reason: string | undefined;
  if (key !== undefined) {
    try {
      await request(
        origin,
        { method: "DELETE", path: paths.revokeKey, what: "the API key", key: key.key },
        z.unknown(),
      );
      revoked = true;
    } catch (error) {
      if (error instanceof PubError && error.status === 401) {
        // A key the server no longer knows is as revoked as it gets.
        revoked = true;
      } else {
        reason = `${error instanceof Error ? error.message : String(error)}; the key still works until it is revoked on dek.pub`;
      }
    }
  }
  const forgotten = await forgetKey(origin);
  return {
    action: "logout",
    server: origin,
    revoked,
    forgotten,
    ...(reason !== undefined ? { reason } : {}),
  };
}

/** `dekc pub whoami`. */
export async function whoamiCommand(flags: FlagValues): Promise<PubResult> {
  const origin = serverOrigin(flags.server);
  const key = await requireKey(origin, flags);
  const me = await request(
    origin,
    { method: "GET", path: paths.me, what: "your account", key: key.key },
    Me,
  );
  return { action: "whoami", server: origin, me, key: key.source };
}

// ---------------------------------------------------------------------------------------------
// Publishing.

/** A deck folder's name as a slug dek.pub takes: lowercase letters, digits, and hyphens. */
export function deckSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63)
    .replace(/-+$/, "");
  return slug === "" ? "deck" : slug;
}

/**
 * `dekc pub publish`: lint as `dekc lint` does, and stop on an error; build the talk for each
 * reader, take the slides' pictures, and upload the lot as the deck's next version, making the
 * deck on dek.pub first when script.md names none.
 */
export async function publishCommand(
  target: ReadableDeck,
  options: { cwd: string; flags: FlagValues; runner?: PlaywrightRunner },
): Promise<PubResult> {
  const { project, deck } = target;
  const { flags } = options;
  const origin = serverOrigin(flags.server);
  const key = await requireKey(origin, flags);
  const lint = await lintCommand({ project, decks: [deck], deck }, { cwd: options.cwd });
  const skippedLint = lint.skipped ?? [];
  if (hasErrors(lint.diagnostics)) {
    return {
      action: "publish",
      published: false,
      server: origin,
      diagnostics: lint.diagnostics,
      ...(skippedLint.length > 0 ? { skipped: skippedLint } : {}),
    };
  }
  let id = deck.deck.pub;
  let base: number | null = null;
  let since: string | undefined;
  let frontmatterWritten = false;
  if (id === undefined) {
    const created = await request(
      origin,
      {
        method: "POST",
        path: paths.decks,
        what: "a new deck",
        key: key.key,
        json: { slug: deckSlug(deck.name), title: deck.deck.title },
      },
      DeckStatus,
    );
    id = created.id;
    // Before the upload, so a failed one leaves the next publish on the same deck.
    writePubId(target, id);
    frontmatterWritten = true;
  } else {
    const status = await request(
      origin,
      { method: "GET", path: paths.deck(id), what: "the deck", key: key.key },
      DeckStatus,
    );
    base = status.latest;
    since = status.versions.find((entry) => entry.n === status.latest)?.createdAt;
  }

  // After pub: is written, so the source sent is the one status compares with.
  const { playerScript, pluginPageScripts } = await import("../runtime/player.ts");
  const version = await prepareVersion(
    { project, deck },
    {
      playerScript: await playerScript(),
      pluginScripts: await pluginPageScripts(),
      ...(options.runner ? { runner: options.runner } : {}),
    },
  );

  const { description, event, date, lang } = deck.deck;
  const manifest: VersionManifest = {
    protocol: PROTOCOL_VERSION,
    dekVersion: pkg.version,
    deck: deck.name,
    title: deck.deck.title,
    ...(description !== undefined ? { description } : {}),
    ...(event !== undefined ? { event } : {}),
    ...(date !== undefined ? { date } : {}),
    lang,
    base,
    slideMap: version.slideMap,
    lint: { errors: 0, warnings: lint.diagnostics.length },
    renames: renamesSince(readRenames(project.root, deck.name), base === null ? undefined : since),
    ...(flags.message !== undefined ? { message: flags.message } : {}),
    files: Object.fromEntries(version.files.map((file) => [file.field, file.sha256])),
    shots: Object.fromEntries((version.shots ?? []).map((shot) => [shot.slug, shot.sha256])),
  };
  const form = new FormData();
  form.append("manifest", JSON.stringify(manifest));
  for (const file of version.files) {
    form.append(file.field, new Blob([file.bytes], { type: file.type }), fileName(file.field));
  }
  for (const shot of version.shots ?? []) {
    form.append(
      shotField(shot.slug),
      new Blob([shot.bytes], { type: "image/png" }),
      `${shot.slug}.png`,
    );
  }
  let published: PublishResult;
  try {
    published = await request(
      origin,
      {
        method: "POST",
        path: paths.versions(id),
        what: "the new version",
        key: key.key,
        form,
        ...(flags["no-promote"] ? { query: { promote: "0" } } : {}),
        timeoutMs: UPLOAD_TIMEOUT_MS,
      },
      PublishResult,
    );
  } catch (error) {
    if (error instanceof PubError && error.status === 409) {
      throw new DekError("another version of the deck was published since this run looked", {
        hint: `run \`${pubCommand("status", flags)}\` to see the versions, then \`${pubCommand("publish", flags)}\` again`,
        cause: error,
      });
    }
    throw error;
  }
  const bytes = (field: string) => ({
    bytes: version.files.find((file) => file.field === field)?.bytes.byteLength ?? 0,
  });
  const skipped = [
    ...skippedLint,
    ...(version.shots === undefined
      ? [
          {
            check: "shots" as const,
            reason: "Playwright is not installed",
            hint: `${PLAYWRIGHT_INSTALL}, then run \`${pubCommand("publish", flags)}\` again`,
          },
        ]
      : []),
  ];
  return {
    action: "publish",
    published: true,
    server: origin,
    id: published.id,
    n: published.n,
    url: published.url,
    current: published.current,
    visibility: published.visibility,
    builds: { full: bytes("full"), public: bytes("public"), bare: bytes("bare") },
    shots: version.shots?.length ?? 0,
    diagnostics: lint.diagnostics,
    ...(skipped.length > 0 ? { skipped } : {}),
    frontmatterWritten,
    changed: frontmatterWritten ? [deck.scriptPath] : [],
  };
}

function writePubId({ project, deck }: ReadableDeck, id: string): void {
  const source = readSourceIfExists(deck.scriptPath, project.root) ?? "";
  writeInside(deck.scriptPath, withFrontmatterKey(source, "pub", id), project.root);
}

// ---------------------------------------------------------------------------------------------
// The deck on dek.pub.

/** `dekc pub status`: the deck as dek.pub has it, and whether the newest version is this source. */
export async function statusCommand(target: ReadableDeck, flags: FlagValues): Promise<PubResult> {
  const origin = serverOrigin(flags.server);
  const id = requireDeckId(target, flags);
  const key = await requireKey(origin, flags);
  const status = await request(
    origin,
    { method: "GET", path: paths.deck(id), what: "the deck", key: key.key },
    DeckStatus,
  );
  const source = sha256(deckSource(target));
  return {
    action: "status",
    server: origin,
    ...status,
    local: { source, published: status.files.source === source },
  };
}

const SHARE_FLAGS =
  "--visibility private|link|public, --script shown|hidden, --embed on|off, or --comments off|signed-in|guests";

/** `dekc pub share`: who may open the deck, read its script, embed it, and comment. */
export async function shareCommand(target: ReadableDeck, flags: FlagValues): Promise<PubResult> {
  const origin = serverOrigin(flags.server);
  const change = {
    ...(flags.visibility !== undefined ? { visibility: Visibility.parse(flags.visibility) } : {}),
    ...(flags.script !== undefined ? { scriptPublic: flags.script === "shown" } : {}),
    ...(flags.embed !== undefined ? { embed: flags.embed === "on" } : {}),
    ...(flags.comments !== undefined ? { comments: CommentPolicy.parse(flags.comments) } : {}),
  };
  if (Object.keys(change).length === 0) {
    throw new DekError("dekc pub share needs a setting to change", {
      hint: `pass ${SHARE_FLAGS}; \`${pubCommand("status", flags)}\` shows the settings now`,
    });
  }
  const id = requireDeckId(target, flags);
  const key = await requireKey(origin, flags);
  const status = await request(
    origin,
    {
      method: "PATCH",
      path: paths.deck(id),
      what: "the deck's settings",
      key: key.key,
      json: change,
    },
    DeckStatus,
  );
  return { action: "share", server: origin, ...status };
}

/**
 * `dekc pub open`: the deck's URL, opened in the browser in text mode. `--json` opens nothing: an
 * agent asked for the address, not for a window on someone's screen.
 */
export async function openCommand(target: ReadableDeck, flags: FlagValues): Promise<PubResult> {
  const origin = serverOrigin(flags.server);
  const id = requireDeckId(target, flags);
  const key = await requireKey(origin, flags);
  const status = await request(
    origin,
    { method: "GET", path: paths.deck(id), what: "the deck", key: key.key },
    DeckStatus,
  );
  if (flags.json !== true) {
    const { openInBrowser } = await import("./open-url.ts");
    await openInBrowser(status.url);
  }
  return { action: "open", server: origin, url: status.url };
}

// ---------------------------------------------------------------------------------------------
// Comments.

/** `dekc pub comments`: the comments on the deck, each placed in the files as they are now. */
export async function commentsCommand(target: ReadableDeck, flags: FlagValues): Promise<PubResult> {
  const origin = serverOrigin(flags.server);
  const id = requireDeckId(target, flags);
  const key = await requireKey(origin, flags);
  const list = await request(
    origin,
    {
      method: "GET",
      path: paths.comments(id),
      what: "the deck's comments",
      key: key.key,
      query: { status: flags.status ?? "open" },
    },
    CommentList,
  );
  return {
    action: "comments",
    server: origin,
    comments: list.comments.map((row) => localComment(target, row)),
  };
}

/** A comment with each target where the deck has it now, as `dekc annotations` places a note's. */
function localComment({ project, deck }: ReadableDeck, row: CommentRow) {
  const source = readSourceIfExists(deck.scriptPath, project.root) ?? "";
  const sections = deck.deck.sections;
  const index = sections.findIndex((section) => section.slug === row.slug);
  const range =
    index < 0
      ? { from: 1, to: source.split("\n").length }
      : {
          from: sections[index]?.line ?? 1,
          to: (sections[index + 1]?.line ?? source.split("\n").length + 1) - 1,
        };
  return {
    ...row,
    targets: row.targets.map((target) => {
      if (target.kind === "element") {
        return { ...target, path: join(deck.dir, target.path) };
      }
      const place = locateQuote(source, target, range);
      return {
        ...target,
        path: deck.scriptPath,
        line: place?.line ?? null,
        column: place?.column ?? null,
        found: place !== undefined,
      };
    }),
    shot: shotCommand(deck.name, row.slug, row.step),
  };
}

/**
 * The ID of the comment `word` names: an ID as dek.pub gives it, or its number in the deck, as
 * `dekc pub comments` lists it.
 */
async function commentId(
  origin: string,
  deckId: string,
  key: Key,
  word: string,
  flags: Flags,
): Promise<string> {
  if (!/^\d+$/.test(word)) {
    return word;
  }
  const list = await request(
    origin,
    {
      method: "GET",
      path: paths.comments(deckId),
      what: "the deck's comments",
      key: key.key,
      query: { status: "all" },
    },
    CommentList,
  );
  const found = list.comments.find((row) => row.number === Number(word));
  if (found === undefined) {
    throw new DekError(`the deck has no comment ${word}`, {
      hint: `run \`${pubCommand("comments --status all", flags)}\` to see each comment's number`,
    });
  }
  return found.id;
}

/** `dekc pub comments reply <id> <text>`. */
export async function replyCommand(
  target: ReadableDeck,
  args: { id: string; text: string },
  flags: FlagValues,
): Promise<PubResult> {
  const origin = serverOrigin(flags.server);
  const id = requireDeckId(target, flags);
  const key = await requireKey(origin, flags);
  const comment = await commentId(origin, id, key, args.id, flags);
  const reply = await request(
    origin,
    {
      method: "POST",
      path: paths.replies(id, comment),
      what: "the reply",
      key: key.key,
      json: { text: args.text },
    },
    Reply,
  );
  return { action: "reply", server: origin, comment, reply };
}

/** `dekc pub comments resolve <id>` and `reopen <id>`. */
export async function settleCommand(
  target: ReadableDeck,
  action: "resolve" | "reopen",
  word: string,
  flags: FlagValues,
): Promise<PubResult> {
  const origin = serverOrigin(flags.server);
  const id = requireDeckId(target, flags);
  const key = await requireKey(origin, flags);
  const comment = await commentId(origin, id, key, word, flags);
  const row = await request(
    origin,
    {
      method: "POST",
      path: action === "resolve" ? paths.resolve(id, comment) : paths.reopen(id, comment),
      what: action === "resolve" ? "resolving the comment" : "reopening the comment",
      key: key.key,
    },
    CommentRow,
  );
  return { action, server: origin, comment, status: row.status };
}
