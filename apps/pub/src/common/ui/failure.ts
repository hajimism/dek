// What a page says when one of its calls to dek.pub failed for a reason it has no words of its own
// for: that dek.pub could not be reached, or the server's own message under a line of the page's
// language.

import type { MessageKey, Vars } from "../i18n.ts";
import { failureOf } from "./call.ts";

type Translate = (key: MessageKey, vars?: Vars) => string;

/** What a page says of a call that failed, as `called` tells it. */
export function failedText(t: Translate, failed: { problem: string; message: string }): string {
  return failed.problem === "offline"
    ? t("common.offline")
    : t("common.error", { message: failed.message });
}

/** What a page says of the error a call threw. */
export function failureText(t: Translate, error: unknown): string {
  return failedText(t, failureOf(error));
}
