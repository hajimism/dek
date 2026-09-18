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
