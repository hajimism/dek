// How the API answers: JSON, and every error as protocol ErrorBody with a stable code.

import type { Context } from "hono";
import { env } from "void/env";
import type { z } from "zod";
import { type ErrorBody, PROTOCOL_HEADER, PROTOCOL_VERSION } from "../../../../src/pub/protocol.ts";
import { ApiError } from "./api-error.ts";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

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
  request: Request,
): Promise<Response> {
  try {
    const spoken = Number(request.headers.get(PROTOCOL_HEADER) ?? PROTOCOL_VERSION);
    if (Number.isFinite(spoken) && spoken > PROTOCOL_VERSION) {
      throw new ApiError(
        400,
        "protocol",
        `this server speaks protocol ${PROTOCOL_VERSION}, not ${spoken}`,
        "use a dekc as old as the server, or wait for the server to update",
      );
    }
    // A cookie rides along on any request the browser makes, so a change made with one must come
    // from a page of this origin. The CLI sends a key and no cookie.
    if (!SAFE_METHODS.has(request.method) && request.headers.has("cookie")) {
      const origin = request.headers.get("origin");
      if (origin !== new URL(request.url).origin) {
        throw new ApiError(403, "cross_origin", "a change must come from a page of dek.pub");
      }
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

/** A path of the app as an absolute URL, for the CLI, feeds and link previews. */
export function appUrl(path: string): string {
  return `${env.APP_ORIGIN}${path}`;
}

/**
 * Let `task` finish after the answer has gone, as mail does: the Worker is kept alive for it,
 * and what it throws is logged. Without a Worker's context, the task simply runs on.
 */
export function afterAnswer(c: Context, task: Promise<unknown>): void {
  const settled = task.catch((error: unknown) => console.error(error));
  try {
    c.executionCtx.waitUntil(settled);
  } catch {
    // No execution context: nothing to keep alive.
  }
}
