// Logging. An error is logged by its name, message, stack frames and causes, never whole: a failed
// query's message, and the stack it heads, carry the values the query was bound to, such as an
// address or a comment's text. A string is logged up to the params such a message ends with.

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
  console[level](
    withoutParams(message),
    ...args.map((arg) =>
      arg instanceof Error ? describe(arg, 0) : typeof arg === "string" ? withoutParams(arg) : arg,
    ),
  );
}

/** Drizzle's DrizzleQueryError ends its message with the values its query was bound to. */
const PARAMS = "\nparams: ";

function withoutParams(text: string): string {
  const params = text.indexOf(PARAMS);
  return params === -1 ? text : text.slice(0, params);
}

/** Causes this deep and beyond are left out, a cycle among them included. */
const MAX_CAUSES = 4;

function describe(error: Error, depth: number): LoggedError {
  // Drizzle's DrizzleQueryError keeps the name "Error" and writes its params into its message.
  const query = isFailedQuery(error) ? error.query : undefined;
  const stack = frames(error);
  const cause = error.cause;
  return {
    name: query === undefined ? error.name : "DrizzleQueryError",
    message: query === undefined ? withoutParams(error.message) : "Failed query",
    ...(query === undefined ? {} : { query }),
    ...(stack ? { stack } : {}),
    ...(cause instanceof Error && depth + 1 < MAX_CAUSES
      ? { cause: describe(cause, depth + 1) }
      : {}),
  };
}

/** The stack's frames, without the message that heads it, whose lines may read as frames too. */
function frames(error: Error): string | undefined {
  const stack = error.stack;
  if (stack === undefined) {
    return undefined;
  }
  const head = stack.indexOf(error.message);
  return (head === -1 ? stack : stack.slice(head + error.message.length))
    .split("\n")
    .filter((line) => /^\s+at /.test(line))
    .join("\n");
}

function isFailedQuery(error: Error): error is Error & { query: string; params: unknown[] } {
  return (
    "query" in error &&
    typeof error.query === "string" &&
    "params" in error &&
    Array.isArray(error.params)
  );
}
