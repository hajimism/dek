import { defineHandler, defineHead, type InferProps } from "void";
import { translate } from "../src/common/i18n.ts";
import { signInFailure } from "../src/model/person/feature/sign-in/failure.ts";
import { safeNext } from "../src/model/person/sign-in-path.ts";

export type Props = InferProps<typeof loader>;

/**
 * Better Auth sends a sign-in that failed back here, by a link or by GitHub, with `error` set: to
 * a link that no longer works, or to an account dek.pub has not invited (ADR 79).
 */
export const loader = defineHandler((c) => ({
  next: safeNext(c.req.query("next")),
  failure: signInFailure(c.req.query("error")),
}));

export const head = defineHead<Props>((c) => ({
  title: translate(c.get("shared").lang, "signin.title"),
  meta: [{ name: "robots", content: "noindex" }],
}));
