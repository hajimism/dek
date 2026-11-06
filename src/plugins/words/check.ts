import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { CheckInput } from "../../plugin-api.ts";
import { lineLocator } from "./lines.ts";
import { type Entry, listedWords, type Problem, readAllows, readList } from "./list.ts";
import { ALLOW_FILE, LIST_FILE, LIST_PATH, type RuleId } from "./manifest.ts";
import { finder } from "./match.ts";
import { type Block, scriptBlocks, slideBlocks } from "./text.ts";

/**
 * A finding, which can name only a rule the manifest declares. A path is relative to the deck, or
 * a file URL for the project's list.
 */
export type Finding = {
  rule: RuleId;
  message: string;
  path: string;
  /** Left out for a file that is not there. */
  line?: number;
  column?: number;
  hint: string;
};

/** Reads a file by its path, relative to the deck's folder or absolute; undefined when absent. */
export type ReadFile = (path: string) => Promise<string | undefined>;

const GUIDE = "https://hajimism.github.io/dek/reference/plugins.html#dek-words";

/**
 * Checks the deck against the project's word list: each listed word in the slides and the script
 * (WORDS001), and the list and the deck's allows reading (WORDS002). A project with no list is
 * WORDS002, since a check that looked for nothing is no pass; a dek that does not say where the
 * list is has nothing to check.
 */
export async function check(input: CheckInput, read: ReadFile): Promise<Finding[]> {
  if (input.pluginDir === undefined) {
    return [];
  }
  const listPath = join(input.pluginDir, LIST_FILE);
  const list = await read(listPath);
  if (list === undefined) {
    return [
      {
        rule: "WORDS002",
        message: `${LIST_PATH} is not there, and [plugins.words] checks each deck against it`,
        path: pathToFileURL(listPath).href,
        hint: `ask the user for the team's words and write them there as ${GUIDE} shows, or take [plugins.words] out of dek.toml`,
      },
    ];
  }
  const misread =
    (path: string, shown: string) =>
    (problem: Problem): Finding => ({
      rule: "WORDS002",
      message: problem.message,
      path,
      line: problem.line,
      hint: `write ${shown} as ${GUIDE} shows`,
    });
  const { entries, problems } = readList(list);
  const findings = problems.map(misread(pathToFileURL(listPath).href, LIST_PATH));
  const allowSource = await read(ALLOW_FILE);
  const allowed =
    allowSource === undefined ? undefined : readAllows(allowSource, listedWords(list));
  findings.push(...(allowed?.problems ?? []).map(misread(ALLOW_FILE, ALLOW_FILE)));

  const active = entries
    .filter((entry) => !allowed?.allows.has(entry.word))
    .map((entry) => ({ entry, find: finder(entry) }));
  const look = (path: string, source: string, blocks: Block[], where: Entry["in"]) => {
    const locate = lineLocator(source);
    for (const block of blocks) {
      for (const { entry, find } of active) {
        if (entry.in !== undefined && entry.in !== where) {
          continue;
        }
        for (const found of find(block.text)) {
          const as = found.text === entry.word ? "" : `, as "${found.text}"`;
          findings.push({
            rule: "WORDS001",
            message: `${entry.word} is on the word list${as}`,
            path,
            ...locate(block.at[found.index] ?? 0),
            hint: entry.use ?? "write the sentence without it",
          });
        }
      }
    }
  };

  const script = await read("script.md");
  if (script !== undefined) {
    look("script.md", script, scriptBlocks(script), "script");
  }
  for (const slide of input.deck.slides) {
    const html = slide.html === null ? undefined : await read(slide.html);
    if (slide.html !== null && html !== undefined) {
      look(slide.html, html, slideBlocks(html), "slides");
    }
  }
  // The same deck gives the same output, in the same order.
  return findings.sort(
    (a, b) =>
      a.path.localeCompare(b.path) ||
      (a.line ?? 0) - (b.line ?? 0) ||
      (a.column ?? 0) - (b.column ?? 0) ||
      a.rule.localeCompare(b.rule),
  );
}
