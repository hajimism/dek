import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DekError } from "../core/index.ts";
import { formatSectionScript } from "../core/timing.ts";
import { requireDeckFromCwd, requireSection } from "./scope.ts";

export type ShowResult = {
  slug: string;
  title: string;
  script: string;
  html: string | null;
};

export function showCommand(options: { cwd: string; slug?: string; deck?: string }): ShowResult {
  const slug = options.slug?.trim();
  if (!slug) {
    throw new DekError("usage: dek show <slug>", { hint: "usage: dek show <slug>" });
  }

  const { deck } = requireDeckFromCwd(options.cwd, options.deck);
  const section = requireSection(deck, slug);

  const htmlPath = join(deck.dir, "slides", `${slug}.html`);
  return {
    slug: section.slug,
    title: section.title,
    script: formatSectionScript(section),
    html: existsSync(htmlPath) ? readFileSync(htmlPath, "utf8") : null,
  };
}
