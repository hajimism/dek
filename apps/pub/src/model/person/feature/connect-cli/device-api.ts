// The device flow's three calls, from the /device page, to Better Auth's endpoints. Looking a code
// up while signed in claims it for this account, which approving or denying it then requires.

import { fetchJson } from "../../../../common/ui/api.ts";
import type { DeviceLookup, DeviceProblem } from "./type.ts";

/** A call to Better Auth, its body as an object; one that is not, or has none, as {}. */
async function call(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const { status, data } = await fetchJson(path, init);
  const body = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  return { status, body };
}

function problemOf(body: Record<string, unknown>): DeviceProblem {
  const words = JSON.stringify(body).toLowerCase();
  if (words.includes("expired")) {
    return "expired";
  }
  if (words.includes("processed") || words.includes("already") || words.includes("forbidden")) {
    return "used";
  }
  return "invalid";
}

export async function lookUp(code: string): Promise<DeviceLookup> {
  try {
    const { status, body } = await call(`/api/auth/device?user_code=${encodeURIComponent(code)}`);
    if (status >= 400) {
      return { ok: false, problem: problemOf(body) };
    }
    if (body.status !== "pending" || typeof body.client_id !== "string") {
      return { ok: false, problem: "used" };
    }
    return { ok: true, scope: typeof body.scope === "string" ? body.scope : null };
  } catch {
    return { ok: false, problem: "offline" };
  }
}

export async function decide(
  code: string,
  allow: boolean,
): Promise<{ ok: true } | { ok: false; problem: DeviceProblem }> {
  try {
    const { status, body } = await call(`/api/auth/device/${allow ? "approve" : "deny"}`, {
      method: "POST",
      body: { userCode: code },
    });
    return status >= 400 ? { ok: false, problem: problemOf(body) } : { ok: true };
  } catch {
    return { ok: false, problem: "offline" };
  }
}
