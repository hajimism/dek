// How the API answers: JSON, and every error as protocol ErrorBody with a stable code.

import type { Context } from "hono";
import type { z } from "zod";
import type { ErrorBody } from "../../../../src/pub/protocol.ts";

export class ApiError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 413 | 415 | 422 | 429,
    readonly code: string,
    message: string,
    readonly hint?: string,
  ) {
    super(message);
  }
}

export function errorResponse(error: ApiError): Response {
  const body: ErrorBody = {
    error: {
      code: error.code,
      message: error.message,
      ...(error.hint ? { hint: error.hint } : {}),
    },
  };
  return Response.json(body, { status: error.status, headers: { "cache-control": "no-store" } });
}

/** Run a handler, turning an ApiError it throws into its answer. */
export async function api(fn: () => Promise<Response | object>): Promise<Response> {
  try {
    const result = await fn();
    return result instanceof Response ? result : Response.json(result);
  } catch (error) {
    if (error instanceof ApiError) {
      return errorResponse(error);
    }
    throw error;
  }
}

export async function jsonBody<T extends z.ZodType>(c: Context, schema: T): Promise<z.infer<T>> {
  let value: unknown;
  try {
    value = await c.req.json();
  } catch {
    throw new ApiError(400, "bad_json", "the body is not JSON");
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ApiError(
      422,
      "invalid",
      parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "),
    );
  }
  return parsed.data;
}

export const notFound = (what = "deck"): ApiError =>
  new ApiError(404, "not_found", `no such ${what}, or it is not yours to see`);
