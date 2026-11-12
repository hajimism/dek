import { defineHandler, defineHead, type InferProps } from "void";
import { translate } from "../src/lib/i18n.ts";
import { safeNext } from "../src/lib/next-path.ts";

export type Props = InferProps<typeof loader>;

export const loader = defineHandler((c) => ({ next: safeNext(c.req.query("next")) }));

export const head = defineHead<Props>((c) => ({
  title: translate(c.get("shared").lang, "signin.title"),
  meta: [{ name: "robots", content: "noindex" }],
}));
