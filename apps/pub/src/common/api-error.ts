// An answer the API gives instead of what was asked: a status, and a stable code a client reads.

export class ApiError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 411 | 413 | 415 | 422 | 429,
    readonly code: string,
    message: string,
    readonly hint?: string,
  ) {
    super(message);
  }
}

export const notFound = (what = "deck"): ApiError =>
  new ApiError(404, "not_found", `no such ${what}, or it is not yours to see`);

/** The 401 of a request that names no one: no session, or no key where one is needed. */
export const signedOut = (message = "sign in first", hint?: string): ApiError =>
  new ApiError(401, "signed_out", message, hint);
