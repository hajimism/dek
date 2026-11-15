// What a page says when one of its calls to dek.pub failed: that dek.pub could not be reached, or
// the server's own message under a line of the page's language.

import type { MessageKey, Vars } from "../i18n.ts";
import { ApiFailure } from "./api.ts";

export function failureText(t: (key: MessageKey, vars?: Vars) => string, error: unknown): string {
  if (error instanceof ApiFailure) {
    return error.code === "offline"
      ? t("common.offline")
      : t("common.error", { message: error.message });
  }
  return t("common.error", { message: "" });
}
