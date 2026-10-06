import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import pkg from "../../package.json";
import { LLMS_PATH, llmsText } from "../../scripts/llms-text.ts";
import { allSpecs } from "../../src/cli/commands.ts";
import { RULES } from "../../src/core/diagnostic.ts";
import { syncDeck } from "../../src/core/sync.ts";
import { repoRoot } from "../helpers/paths.ts";
import { withTempProject } from "../helpers/project.ts";

// Every place an agent is told how to use dek: what dekc sync writes into AGENTS.md, what
// llms.txt says to an agent outside any project, and the official skill. Each must name only
// what exists, and the two written by hand must not drift from what the code says.

const read = (path: string): string => readFileSync(join(repoRoot, path), "utf8");
const skill = read("skills/dek/SKILL.md");
const commands = new Set(allSpecs().map(([name]) => name));

/** Each command a text names as `dekc <word>`, and the DEK ids it names. */
function named(text: string): { commands: string[]; rules: string[] } {
  return {
    commands: [...text.matchAll(/\bdekc ([a-z][a-z-]*)/g)].map((match) => match[1] ?? ""),
    rules: [...text.matchAll(/\bDEK\d{3}\b/g)].map((match) => match[0]),
  };
}

/**
 * The commands of the oldest dek the skill still teaches, 0.2.0. The skill is installed apart
 * from dek, so it must not tell a project on that version to run a command it does not have;
 * name a newer command, and this list, with the skill's "First" section, must move up with it.
 */
const SKILL_FLOOR = new Set([
  "init",
  "new",
  "ls",
  "ref",
  "show",
  "theme",
  "check",
  "shot",
  "mv",
  "goto",
  "current",
  "marks",
  "sync",
  "lint",
  "cues",
  "voice",
  "build",
  "video",
  "pdf",
  "help",
]);

describe("agent guidance", () => {
  test("llms.txt is what the docs, the rule table, and the commands say now", () => {
    expect(read(LLMS_PATH), "run `bun run llms` and commit the result").toBe(llmsText());
  });

  test("llms.txt counts the rules from the table", () => {
    const ids = Object.keys(RULES).sort();
    expect(llmsText()).toContain(`${ids[0]} to ${ids.at(-1)}, ${ids.length} rules`);
  });

  test("names only commands and rules that exist, wherever an agent reads it", async () => {
    const agents = await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
      syncDeck(join(root, "decks", "demo"));
      return readFileSync(join(root, "AGENTS.md"), "utf8");
    });
    for (const [where, text] of [
      ["AGENTS.md", agents],
      ["llms.txt", llmsText()],
      ["SKILL.md", skill],
    ] as const) {
      const found = named(text);
      expect({
        where,
        unknown: found.commands.filter((name) => !commands.has(name as never)),
      }).toEqual({ where, unknown: [] });
      expect({ where, unknown: found.rules.filter((id) => !(id in RULES)) }).toEqual({
        where,
        unknown: [],
      });
    }
  });

  test("the skill teaches no command the oldest dek it covers lacks", () => {
    expect(named(skill).commands.filter((name) => !SKILL_FLOOR.has(name))).toEqual([]);
  });

  test("the skill runs dek the one way that works", () => {
    expect(skill).toMatch(/^---\nname: dek\ndescription: .+\n---\n/);
    expect(skill).toContain("bunx dekc help --agent");
    expect(skill).toContain("`bunx @hajimism/dek`");
    // Only ever named as what not to type.
    expect(skill.match(/`(bunx|npx) dek`/g)).toEqual(["`bunx dek`", "`npx dek`"]);
    expect(skill).not.toMatch(/npx (dekc|@hajimism)/);
  });

  test("the skill ships in the package and installs as a Claude Code plugin", () => {
    expect(pkg.files).toContain("skills");
    const plugin = JSON.parse(read(".claude-plugin/plugin.json")) as { name: string };
    const marketplace = JSON.parse(read(".claude-plugin/marketplace.json")) as {
      name: string;
      owner: { name: string };
      plugins: Array<{ name: string; source: string }>;
    };
    expect(plugin.name).toBe("dek");
    expect(marketplace.owner.name).not.toBe("");
    expect(marketplace.plugins).toEqual([expect.objectContaining({ name: "dek", source: "./" })]);
    expect(llmsText()).toContain(`/plugin install ${plugin.name}@${marketplace.name}`);
  });
});
