// How the API answers: JSON, and every error as protocol ErrorBody with a stable code.

import type { Context } from "hono";
import type { z } from "zod";
import { type ErrorBody, PROTOCOL_HEADER, PROTOCOL_VERSION } from "../../../../src/pub/protocol.ts";

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

function errorResponse(error: ApiError): Response {
  const body: ErrorBody = {
    error: {
      code: error.code,
      message: error.message,
      ...(error.hint ? { hint: error.hint } : {}),
    },
  };
  return Response.json(body, { status: error.status, headers: { "cache-control": "no-store" } });
}

/**
 * Run a handler, turning an ApiError it throws into its answer, and anything else into a 500 in
 * the same shape, so a client always reads one kind of error. A client that speaks a newer
 * protocol than this server is told so before anything runs.
 */
export async function api(
  fn: () => Promise<Response | object>,
  request?: Request,
): Promise<Response> {
  try {
    const spoken = Number(request?.headers.get(PROTOCOL_HEADER) ?? PROTOCOL_VERSION);
    if (Number.isFinite(spoken) && spoken > PROTOCOL_VERSION) {
      throw new ApiError(
        400,
        "protocol",
        `this server speaks protocol ${PROTOCOL_VERSION}, not ${spoken}`,
        "use a dekc as old as the server, or wait for the server to update",
      );
    }
    const result = await fn();
    return result instanceof Response ? result : Response.json(result);
  } catch (error) {
    if (error instanceof ApiError) {
      return errorResponse(error);
    }
    console.error(error);
    const body: ErrorBody = {
      error: { code: "internal", message: "something went wrong on dek.pub's side" },
    };
    return Response.json(body, { status: 500, headers: { "cache-control": "no-store" } });
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
