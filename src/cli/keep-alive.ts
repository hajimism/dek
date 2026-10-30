import type { DevServer } from "../server/dev.ts";
import { writeDevEvent } from "./format.ts";

/** How often the server checks that whoever started it is still there. */
const PARENT_POLL_MS = 1_000;

/** How long a stop waits for the server to close before the process exits anyway. */
const SHUTDOWN_GRACE_MS = 2_000;

/**
 * The process that started this one, read as the CLI loads. A parent read once the server is up
 * would come too late: whoever waits for the URL can be killed before the next line runs, and the
 * parent read then is already init, which never goes away.
 */
const startedBy = process.ppid;

/**
 * Serve until told to stop: Ctrl-C, a kill, a closed terminal, or the process that started the
 * server going away, so a test run or an editor that dies without cleaning up leaves no server
 * holding a port.
 */
export async function keepDevServer(server: DevServer): Promise<void> {
  const stop = stopOnce(
    () => server.close(),
    (code) => process.exit(code),
  );
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
    process.on(signal, stop);
  }
  onOrphaned(stop);
  // A server scoped to one deck has nothing to tell apart; one that serves several names each.
  server.events.listen((event) =>
    writeDevEvent(event, process.stderr, {
      cwd: process.cwd(),
      ...(server.deckDir === undefined ? { deck: event.deck } : {}),
    }),
  );
  await new Promise<void>(() => {
    /* keep the process alive until stopped */
  });
}

/** A stop that closes once however often it is asked, and exits even if the close never ends. */
export function stopOnce(
  close: () => Promise<void>,
  exit: (code: number) => void,
  graceMs = SHUTDOWN_GRACE_MS,
): () => void {
  let stopping = false;
  return () => {
    if (stopping) {
      return;
    }
    stopping = true;
    setTimeout(() => exit(0), graceMs).unref();
    void close().finally(() => exit(0));
  };
}

/**
 * Call `fn` once this process is no longer under `parent`, the one that started it, which is how
 * Unix says the parent died: a SIGKILL leaves it no chance to stop its children. A process started
 * with no parent of its own to lose (already under init) is never orphaned.
 */
export function onOrphaned(
  fn: () => void,
  options: { parent?: number; ppid?: () => number; intervalMs?: number } = {},
): () => void {
  const { parent = startedBy, ppid = () => process.ppid } = options;
  const timer = setInterval(() => {
    if (ppid() !== parent) {
      clearInterval(timer);
      fn();
    }
  }, options.intervalMs ?? PARENT_POLL_MS);
  timer.unref();
  return () => clearInterval(timer);
}
