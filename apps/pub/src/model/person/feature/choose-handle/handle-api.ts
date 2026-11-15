// The page's two calls: whether a handle may be chosen, and choosing it.

import { paths } from "../../../../../../../src/pub/paths.ts";
import type { HandleStatus } from "../../../../../../../src/pub/protocol.ts";
import { api } from "../../../../common/ui/api.ts";
import { type Called, called } from "../../../../common/ui/call.ts";
import { HANDLE_CODES } from "./type.ts";

export async function checkHandle(handle: string): Promise<HandleStatus["status"] | "offline"> {
  try {
    return (await api<HandleStatus>(paths.handle(handle))).status;
  } catch {
    return "offline";
  }
}

export function chooseHandle(handle: string): Promise<Called<unknown, keyof typeof HANDLE_CODES>> {
  return called(() => api(paths.myHandle, { method: "PUT", body: { handle } }), HANDLE_CODES);
}
