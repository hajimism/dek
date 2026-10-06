/**
 * What `docs/public/llms.txt` says, built from where each fact is kept rather than written twice:
 * the pages in the order the docs site lists them, each with the `description` its frontmatter
 * gives the site; the lint rules from the rule table; the commands as `dekc help --agent` prints
 * them; and the package and command names from package.json. `bun run llms` writes it, and a test
 * fails while the committed file differs.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import pkg from "../package.json";
import { agentHelpText } from "../src/cli/usage.ts";
import { RULES } from "../src/core/diagnostic.ts";

export const LLMS_PATH = "docs/public/llms.txt";

const SITE = "https://hajimism.github.io/dek/";
const REPO = "https://github.com/hajimism/dek";
const docs = join(import.meta.dir, "..", "docs");

/** The English pages under `section`, in the order the site's sidebar lists them. */
function sidebarPages(section: "guide" | "reference"): string[] {
  const config = readFileSync(join(docs, ".vitepress", "config.ts"), "utf8");
  return [...config.matchAll(/link: `\$\{p\}\/(guide|reference)\/([a-z-]+)`/g)]
    .filter(([, found]) => found === section)
    .map(([, , page]) => `${section}/${page}`);
}

/** A page's title, its `#` heading, and the description its frontmatter gives the site. */
function pageFacts(page: string): { title: string; description: string } {
  const source = readFileSync(join(docs, `${page}.md`), "utf8");
  const frontmatter = source.match(/^---\n([\s\S]*?)\n---\n/)?.[1];
  const description = frontmatter
    ? (Bun.YAML.parse(frontmatter) as { description?: unknown }).description
    : undefined;
  const title = source.match(/^# (.+)$/m)?.[1];
  if (typeof description !== "string" || title === undefined) {
    throw new Error(`docs/${page}.md needs a # title and a description in its frontmatter`);
  }
  return { title, description };
}

/** The ids the rule table holds: first, last, and how many, since a number is never reused. */
function ruleRange(): string {
  const ids = Object.keys(RULES).sort();
  return `${ids[0]} to ${ids.at(-1)}, ${ids.length} rules`;
}

function pageLines(section: "guide" | "reference"): string[] {
  return sidebarPages(section).map((page) => {
    const { title, description } = pageFacts(page);
    const extra = page === "reference/lint" ? ` ${ruleRange()}.` : "";
    return `- [${title}](${SITE}${page}.html): ${description}${extra}`;
  });
}

export function llmsText(): string {
  const command = Object.keys(pkg.bin)[0] ?? "dekc";
  return `# dek

> A build system for talks. Write what you will say; dek builds, measures, and ships the rest.

Site: ${SITE}
Japanese: ${SITE}ja/
Repo: ${REPO}

dek runs on Bun. Install dek into the project with \`bun add -d ${pkg.name}\` and run it as \`bunx ${command}\` from inside it, or \`bunx ${pkg.name}\` outside one; the command is \`${command}\`, not \`dek\`: \`dek\` on npm is an unrelated package, which \`bunx dek\` downloads and runs. Use \`bunx\`, not \`npx\`.

Agents use the same CLI as humans. Run \`${command} help --agent\`, or \`${command} help <command>\` for one command's flags; they describe the dek installed in the project, which wins over anything written here. Result commands accept \`--json\`: branch on \`ok\`; every \`"ok": false\` carries \`error\` (\`message\`, \`hint\`, optional \`path\`/\`line\`), and lint, check, build, ls, and cues always carry \`diagnostics\` (with \`line\`/\`column\` and \`data\`). A check that did not run is in \`skipped\` with its \`reason\` and \`hint\`. 0.x: the JSON shape and DEK ids may change; DEK ids are never reused. Diagnostics: \`${command} lint --format sarif\`. Do not parse human-oriented text output.

## Skill

The official skill teaches an agent the loop: script first, then one slide at a time with \`show\`, an edit, \`check --shot\`, and \`lint\`, and when to stop. It names few commands and defers to \`${command} help --agent\` for the rest, so it never runs ahead of the dek a project has.

- The skills CLI: \`npx skills add hajimism/dek\`
- Claude Code: \`/plugin marketplace add hajimism/dek\`, then \`/plugin install dek@dek\`
- In a project: \`node_modules/${pkg.name}/skills/dek/SKILL.md\`, the copy for the dek installed there

## Guide

${pageLines("guide").join("\n")}

## Reference

${pageLines("reference").join("\n")}

## Commands

As \`${command} help --agent\` prints them for the dek this file was written with:

\`\`\`text
${agentHelpText().trimEnd()}
\`\`\`
`;
}
