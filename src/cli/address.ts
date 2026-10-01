import { existsSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { isInside } from "../core/path.ts";
import { COMMANDS } from "./commands.ts";

/** A deck a hint is about: the name a command takes, and the directory that makes it implicit. */
export type HintDeck = { name: string; dir: string };

/**
 * A hint's commands as they run from `cwd`. Hints are written as if run inside the deck they are
 * about, where a command finds its deck by itself. Run anywhere else, a command that takes a deck
 * needs its name: as the first word outside every deck, and as `--deck` inside another deck,
 * where a first word names something in that deck instead. A command that already names a deck,
 * or takes none, is left as written.
 */
export function addressHint(hint: string, deck: HintDeck | undefined, cwd: string): string {
  if (deck === undefined || isInside(cwd, deck.dir)) {
    return hint;
  }
  const naming = deckAround(cwd) === undefined ? deck.name : `--deck ${deck.name}`;
  return hint.replace(COMMAND_RE, (whole, command: string, rest: string) => {
    if (!DECK_COMMANDS.has(command) || namesDeck(rest, deck.name)) {
      return whole;
    }
    return `\`dekc ${command} ${naming}${rest}\``;
  });
}

/** A backquoted command: `dekc`, a command word, and what follows it up to the closing quote. */
const COMMAND_RE = /`dekc ([a-z]+)((?: [^`]*)?)`/g;

const DECK_COMMANDS = new Set(
  Object.entries(COMMANDS).flatMap(([name, spec]) => ("scope" in spec && spec.scope ? [name] : [])),
);

function namesDeck(rest: string, name: string): boolean {
  const [first] = rest.trim().split(/\s+/);
  return first === name || first?.includes("/") === true || /(?:^| )--deck(?: |$)/.test(rest);
}

/**
 * The deck `path` lies in: the directory under a project's `decks/`, found from the path alone.
 * A source path dekc reports is absolute, so no project needs to be resolved to address it.
 */
export function deckAround(path: string): HintDeck | undefined {
  for (let dir = path; dirname(dir) !== dir; dir = dirname(dir)) {
    const parent = dirname(dir);
    if (basename(parent) === "decks" && existsSync(join(dirname(parent), "dekc.toml"))) {
      return { name: basename(dir), dir };
    }
  }
  return undefined;
}
