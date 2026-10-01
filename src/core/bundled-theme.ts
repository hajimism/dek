import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseCss, publishedTokens } from "./css.ts";

const bundledThemePath = join(import.meta.dir, "..", "theme", "default.css");

/** The theme dekc ships, which `dekc init` writes and every required token is set in. */
export function bundledTheme(): string {
  return readFileSync(bundledThemePath, "utf8");
}

/** The value dekc's own theme gives a token, for a hint that can be written as is. */
export function bundledTokenValue(name: string): string | undefined {
  return publishedTokens(parseCss(bundledTheme())).find((token) => token.name === name)?.value;
}
