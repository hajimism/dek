// Logging. An error is logged by its name, message, stack frames and causes, never whole: a failed
// query's message, and the stack it heads, carry the values the query was bound to, such as an
// address or a comment's text.

type Level = "debug" | "info" | "warn" | "error";

/** An error as it goes to the log. */
type LoggedError = {
  name: string;
  message: string;
  /** A failed query's SQL, with `?` where its values were. */
  query?: string;
  stack?: string;
  cause?: LoggedError;
};

/** Log `message` at `level`, with each error among `args` described; Better Auth logs through it. */
export function log(level: Level, message: string, ...args: unknown[]): void {
  console[level](message, ...args.map((arg) => (arg instanceof Error ? describe(arg, 0) : arg)));
}

/** Causes this deep and beyond are left out, a cycle among them included. */
const MAX_CAUSES = 4;

function describe(error: Error, depth: number): LoggedError {
  // Drizzle's DrizzleQueryError keeps the name "Error" and writes its params into its message.
  const query = isFailedQuery(error) ? error.query : undefined;
  const stack = error.stack
    ?.split("\n")
    .filter((line) => /^\s+at /.test(line))
    .join("\n");
  const cause = error.cause;
  return {
    name: query === undefined ? error.name : "DrizzleQueryError",
    message: query === undefined ? error.message : "Failed query",
    ...(query === undefined ? {} : { query }),
    ...(stack ? { stack } : {}),
    ...(cause instanceof Error && depth + 1 < MAX_CAUSES
      ? { cause: describe(cause, depth + 1) }
      : {}),
  };
}

function isFailedQuery(error: Error): error is Error & { query: string; params: unknown[] } {
  return (
    "query" in error &&
    typeof error.query === "string" &&
    "params" in error &&
    Array.isArray(error.params)
  );
}
