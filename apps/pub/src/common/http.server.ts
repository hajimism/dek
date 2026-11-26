// How the API answers: JSON, and every error as protocol ErrorBody with a stable code.

import type { Context } from "hono";
import { env } from "void/env";
import type { z } from "zod";
import { type ErrorBody, PROTOCOL_HEADER, PROTOCOL_VERSION } from "../../../../src/pub/protocol.ts";
import { ApiError } from "./api-error.ts";
import { refusal } from "./http.ts";
import { log } from "./log.ts";

function withProtocolHeader(response: Response): Response {
  const value = String(PROTOCOL_VERSION);
  try {
    response.headers.set(PROTOCOL_HEADER, value);
    return response;
  } catch {
    const headers = new Headers(response.headers);
    headers.set(PROTOCOL_HEADER, value);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
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
  return Response.json(body, {
    status: error.status,
    headers: { "cache-control": "no-store", [PROTOCOL_HEADER]: String(PROTOCOL_VERSION) },
  });
}

/**
 * Run a handler, turning an ApiError it throws into its answer, and anything else into a 500 in
 * the same shape, so a client always reads one kind of error. What `refusal` refuses is answered
 * before anything runs.
 */
export async function api(
  fn: () => Promise<Response | object>,
  request: Request,
): Promise<Response> {
  try {
    const refused = refusal(request);
    if (refused) {
      throw refused;
    }
    const result = await fn();
    const response = result instanceof Response ? result : Response.json(result);
    return withProtocolHeader(response);
  } catch (error) {
    if (error instanceof ApiError) {
      return errorResponse(error);
    }
    log("error", `${request.method} ${new URL(request.url).pathname} failed`, error);
    const body: ErrorBody = {
      error: { code: "internal", message: "something went wrong on dek.pub's side" },
    };
    return Response.json(body, {
      status: 500,
      headers: { "cache-control": "no-store", [PROTOCOL_HEADER]: String(PROTOCOL_VERSION) },
    });
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
  const settled = task.catch((error: unknown) =>
    log("error", "a task after the answer failed", error),
  );
  try {
    c.executionCtx.waitUntil(settled);
  } catch {
    // No execution context: nothing to keep alive.
  }
}
