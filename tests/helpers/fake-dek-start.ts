/**
 * Starts of the dev server, as far as their lock, one for each line on stdin:
 *
 * - `{ "go", "root", "what", "port" }` takes the lock for `what`, a deck's name or `--project`,
 *   in the project at `root`, at the moment `go` names, so that several of these take it at
 *   once, and prints what came of it.
 * - `{ "release": true }` gives up what the last line took, and prints that it did.
 */
import {
  devServerUrl,
  removeDevServerLock,
  type ServerScope,
  writeDevServerLock,
} from "../../src/server/lock.ts";

type Take = { go: number; root: string; what: string; port: number };

let held: { root: string; deck?: string } | undefined;

process.stdout.write("ready\n");
for await (const line of console) {
  if (line.trim() === "") {
    continue;
  }
  const asked = JSON.parse(line) as Take | { release: true };
  if ("release" in asked) {
    if (held) {
      removeDevServerLock(held.root, held.deck);
      held = undefined;
    }
    process.stdout.write(`${JSON.stringify({ released: true })}\n`);
    continue;
  }
  const deck = asked.what === "--project" ? undefined : asked.what;
  const scope: ServerScope = deck === undefined ? { decks: [] } : { deck };
  // Spin up to the moment, since a timer would wake each process when it pleased.
  while (Date.now() < asked.go) {
    /* wait */
  }
  let refused: string | undefined;
  try {
    writeDevServerLock(asked.root, scope, { url: devServerUrl(asked.port) });
    held = { root: asked.root, ...(deck !== undefined ? { deck } : {}) };
  } catch (error) {
    refused = (error as Error).message;
  }
  process.stdout.write(
    `${JSON.stringify({ pid: process.pid, what: asked.what, took: refused === undefined, refused })}\n`,
  );
}
