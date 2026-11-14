import { defineHandler, defineHead, type InferProps } from "void";
import { translate } from "../src/common/i18n.ts";
import { safeNext } from "../src/model/person/sign-in-path.ts";

export type Props = InferProps<typeof loader>;

/** Better Auth sends a sign-in link that no longer works back here, with `error` set. */
export const loader = defineHandler((c) => ({
  next: safeNext(c.req.query("next")),
  linkFailed: c.req.query("error") !== undefined,
}));

export const head = defineHead<Props>((c) => ({
  title: translate(c.get("shared").lang, "signin.title"),
  meta: [{ name: "robots", content: "noindex" }],
}));
