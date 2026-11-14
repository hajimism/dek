// The page's two calls: whether a handle may be chosen, and choosing it. The paths are protocol
// `paths.handle` and `paths.myHandle`, written out, as the protocol module brings zod with it.

import type { HandleStatus } from "../../../../../../../src/pub/protocol.ts";
import { ApiFailure, api } from "../../../../common/ui/api.ts";
import { CHOICE_ERRORS, type HandleProblem } from "./type.ts";

export async function checkHandle(handle: string): Promise<HandleStatus["status"] | "offline"> {
  try {
    return (await api<HandleStatus>(`/api/handles/${encodeURIComponent(handle)}`)).status;
  } catch {
    return "offline";
  }
}

export async function chooseHandle(
  handle: string,
): Promise<{ ok: true } | { ok: false; problem: HandleProblem }> {
  try {
    await api("/api/me/handle", { method: "PUT", body: { handle } });
    return { ok: true };
  } catch (error) {
    if (!(error instanceof ApiFailure)) {
      return { ok: false, problem: "failed" };
    }
    if (error.code === "offline") {
      return { ok: false, problem: "offline" };
    }
    const problem: HandleProblem | undefined =
      CHOICE_ERRORS[error.code as keyof typeof CHOICE_ERRORS];
    return { ok: false, problem: problem ?? "failed" };
  }
}
