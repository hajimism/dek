export class DekError extends Error {
  readonly line?: number;
  readonly path?: string;
  readonly hint?: string;

  constructor(
    message: string,
    options?: { line?: number; path?: string; hint?: string; cause?: unknown },
  ) {
    super(message, { cause: options?.cause });
    this.name = "DekError";
    this.line = options?.line;
    this.path = options?.path;
    this.hint = options?.hint;
  }
}

/** What a thrown value says, as plain fields: a DekError keeps its location and hint. */
export type ErrorFields = { message: string; path?: string; line?: number; hint?: string };

export function errorFields(error: unknown): ErrorFields {
  if (error instanceof DekError) {
    return {
      message: error.message,
      ...(error.path !== undefined ? { path: error.path } : {}),
      ...(error.line !== undefined ? { line: error.line } : {}),
      ...(error.hint !== undefined ? { hint: error.hint } : {}),
    };
  }
  return { message: error instanceof Error ? error.message : String(error) };
}
