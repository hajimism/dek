import { defineHandler, defineHead, type InferProps } from "void";
import { formatUserCode } from "../src/model/person/feature/connect-cli/device-code.ts";
import { translate } from "../src/common/i18n.ts";

export type Props = InferProps<typeof loader>;

export const loader = defineHandler((c) => ({
  code: formatUserCode(c.req.query("user_code") ?? c.req.query("code") ?? ""),
}));

export const head = defineHead<Props>((c) => ({
  title: translate(c.get("shared").lang, "device.title"),
  meta: [{ name: "robots", content: "noindex" }],
}));
