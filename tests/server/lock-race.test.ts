import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { withTempDir } from "../helpers/fs.ts";

const worker = join(import.meta.dir, "..", "helpers", "fake-dek-start.ts");

/** How many starts take a lock at once, and how many times over: enough that a lock two can take is taken by two. */
const STARTS = 8;
const ROUNDS = 25;

/** How long the starts are given to hear the moment before it comes. */
const HEAD_START_MS = 20;

type Outcome = { pid: number; what: string; took: boolean; refused?: string };

type Start = {
  proc: Bun.Subprocess<"pipe", "pipe", "inherit">;
  reader: ReadableStreamDefaultReader<Uint8Array>;
  rest: { text: string };
};

/** One line of what a start prints: that it is ready, what came of a take, that it let go. */
async function lineOf({ reader, rest }: Start): Promise<string> {
  for (;;) {
    const end = rest.text.indexOf("\n");
    if (end >= 0) {
      const line = rest.text.slice(0, end);
      rest.text = rest.text.slice(end + 1);
      return line;
    }
    const { value, done } = await reader.read();
    if (done) {
      throw new Error(`a start ended before it answered: ${rest.text}`);
    }
    rest.text += new TextDecoder().decode(value);
  }
}

function say(start: Start, message: object): void {
  start.proc.stdin.write(`${JSON.stringify(message)}\n`);
  start.proc.stdin.flush();
}

/** Run `fn` with `count` processes that each take a lock when told, and end them after. */
async function withStarts(count: number, fn: (starts: Start[]) => Promise<void>): Promise<void> {
  const starts = Array.from({ length: count }, (): Start => {
    const proc = Bun.spawn([process.execPath, worker], {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "inherit",
    });
    return { proc, reader: proc.stdout.getReader(), rest: { text: "" } };
  });
  try {
    await Promise.all(starts.map(lineOf));
    await fn(starts);
  } finally {
    for (const { proc } of starts) {
      proc.stdin.end();
    }
    await Promise.all(starts.map(({ proc }) => proc.exited));
  }
}

/**
 * Have each of `starts` take the lock for its entry of `whats`, a deck's name or `--project`, in
 * the project at `root`, all at one moment, and give what came of each to `check` while the
 * winners still hold theirs.
 */
async function startAtOnce(
  starts: Start[],
  root: string,
  whats: string[],
  check: (outcomes: Outcome[]) => void,
): Promise<void> {
  const go = Date.now() + HEAD_START_MS;
  starts.forEach((start, at) => {
    say(start, { go, root, what: whats[at], port: 5200 + at });
  });
  try {
    const answers = await Promise.all(starts.map(lineOf));
    check(answers.map((line) => JSON.parse(line) as Outcome));
  } finally {
    for (const start of starts) {
      say(start, { release: true });
    }
    await Promise.all(starts.map(lineOf));
  }
}

const lockOf = (root: string, deck?: string): { pid: number } | undefined => {
  const path = deck
    ? join(root, ".dek", "servers", `${deck}.json`)
    : join(root, ".dek", "server.json");
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as { pid: number }) : undefined;
};

// The lock's own tests run in one process, where what this process holds settles every race
// before a file is read. These are the races between processes, which only the files settle.
describe("dev servers that start at once, each in its own process", () => {
  test("one of them takes a deck's lock that its server left behind, and the lock is its own", async () => {
    await withStarts(STARTS, async (starts) => {
      for (let round = 0; round < ROUNDS; round += 1) {
        await withTempDir(async (root) => {
          mkdirSync(join(root, ".dek", "servers"), { recursive: true });
          writeFileSync(
            join(root, ".dek", "servers", "talk.json"),
            `${JSON.stringify({ url: "http://127.0.0.1:5199/", pid: 2_147_483_647 })}\n`,
          );
          await startAtOnce(starts, root, Array<string>(STARTS).fill("talk"), (outcomes) => {
            const winners = outcomes.filter((outcome) => outcome.took);
            expect({ round, winners: winners.length }).toEqual({ round, winners: 1 });
            expect(lockOf(root, "talk")?.pid).toBe(winners[0]?.pid);
            for (const { took, refused } of outcomes) {
              if (!took) {
                expect(refused).toMatch(
                  /^dev server already running at |says another dev server is taking this lock$/,
                );
              }
            }
          });
        });
      }
    });
  }, 60_000);

  test("a deck is never held by a server for the project and by one of its own", async () => {
    await withStarts(STARTS, async (starts) => {
      const whats = Array.from({ length: STARTS }, (_, at) =>
        at % 2 === 0 ? "--project" : "talk",
      );
      for (let round = 0; round < ROUNDS; round += 1) {
        await withTempDir(async (root) => {
          await startAtOnce(starts, root, whats, (outcomes) => {
            const winners = outcomes.filter((outcome) => outcome.took);
            // Each gives way to the other it sees, so none may be left: never two.
            expect({ round, winners: winners.length }).toEqual({
              round,
              winners: Math.min(winners.length, 1),
            });
            expect([lockOf(root), lockOf(root, "talk")].filter(Boolean).length).toBe(
              winners.length,
            );
          });
        });
      }
    });
  }, 60_000);
});
