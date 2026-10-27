import { existsSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { shellName } from "../core/escape.ts";
import { isInside } from "../core/path.ts";
import { snapshotName } from "../core/ref.ts";
import { type AnySpec, COMMANDS, subcommandsOf } from "./commands.ts";

/** A deck a hint is about: the name a command takes, and the directory that makes it implicit. */
export type HintDeck = { name: string; dir: string };

/**
 * A hint's commands as they run from `cwd`. Hints are written as if run inside the deck they are
 * about, where a command finds its deck by itself. Run anywhere else, a command that takes a deck
 * needs its name: as the first word outside every deck, and as `--deck` inside another deck,
 * where a first word names something in that deck instead, or where the name would read as a
 * subcommand or a flag. The name is one shell word, however it is spelled, or `<deck>` when no
 * word holds it alike in every shell, with where to find it unless `note` is false, for a hint
 * that joins several and says it once. A command that already names a deck, or takes none, is
 * left as written.
 */
export function addressHint(
  hint: string,
  deck: HintDeck | undefined,
  cwd: string,
  { note: noted = true }: { note?: boolean } = {},
): string {
  if (deck === undefined || isInside(cwd, deck.dir)) {
    return hint;
  }
  const word = shellName(deck.name) ?? DECK_PLACEHOLDER;
  const inOther = deckAround(cwd) !== undefined;
  // The note a placeholder adds names `dekc ls` for the project, not for the deck.
  const note = hint.indexOf(PLACEHOLDER_NOTE);
  let placed = false;
  const addressed = hint.replace(
    COMMAND_RE,
    (whole, command: string, rest: string, offset: number) => {
      const subcommand = SUBCOMMAND_WORDS.get(command)?.has(deck.name) === true;
      // A first word that is a subcommand, or a flag, is never the deck's name.
      const positional = !subcommand && !deck.name.startsWith("-");
      if (
        !DECK_COMMANDS.has(command) ||
        namesDeck(rest, positional ? word : undefined) ||
        (note >= 0 && offset >= note && offset < note + PLACEHOLDER_NOTE.length)
      ) {
        return whole;
      }
      placed ||= word === DECK_PLACEHOLDER;
      const flag = inOther || subcommand;
      return `\`dekc ${command} ${flag ? deckFlag(deck.name) : deckWord(deck.name)}${rest}\``;
    },
  );
  return placed && note < 0 && noted ? `${addressed}${PLACEHOLDER_NOTE}` : addressed;
}

/** `hint` with where to find a deck's name, once, when one of its commands has `<deck>` for it. */
export function withPlaceholderNote(hint: string): string {
  return hint.includes(DECK_PLACEHOLDER) && !hint.includes(PLACEHOLDER_NOTE)
    ? `${hint}${PLACEHOLDER_NOTE}`
    : hint;
}

/** Where a hint with `<deck>` in it says to find the deck's name. */
const PLACEHOLDER_NOTE = "; for <deck>, name the deck as `dekc ls` lists it";

/** What a command shows for a deck no word holds alike in every shell. */
const DECK_PLACEHOLDER = "<deck>";

/**
 * A deck's name as the first word of a command: one shell word, `<deck>` when there is none, or
 * `--deck=` when the name starts with a dash, which a first word would read as a flag.
 */
export function deckWord(name: string): string {
  return name.startsWith("-") ? deckFlag(name) : (shellName(name) ?? DECK_PLACEHOLDER);
}

/** A deck's name as `--deck`, joined with `=` when it starts with a dash, as a value must be. */
export function deckFlag(name: string): string {
  const word = shellName(name) ?? DECK_PLACEHOLDER;
  return name.startsWith("-") ? `--deck=${word}` : `--deck ${word}`;
}

/** A backquoted command: `dekc`, a command word, and what follows it up to the closing quote. */
const COMMAND_RE = /`dekc ([a-z]+)((?: [^`]*)?)`/g;

const DECK_COMMANDS = new Set(
  Object.entries(COMMANDS).flatMap(([name, spec]) => ("scope" in spec && spec.scope ? [name] : [])),
);

/** The first word of each command's subcommands, which a deck's name in its place would read as. */
const SUBCOMMAND_WORDS = new Map(
  Object.entries(COMMANDS).map(([name, spec]) => [
    name,
    new Set(Object.keys(subcommandsOf(spec as AnySpec)).map((sub) => sub.split(" ")[0])),
  ]),
);

/**
 * Whether a command's words already name a deck: as `word`, the deck's name as one shell word,
 * when the deck can be named first, as a ref, or with --deck.
 */
function namesDeck(rest: string, word: string | undefined): boolean {
  const words = rest.trim();
  const [first] = words.split(/\s+/);
  return (
    (word !== undefined && (words === word || words.startsWith(`${word} `))) ||
    first?.includes("/") === true ||
    /(?:^| )--deck(?:[ =]|$)/.test(rest)
  );
}

/**
 * The deck `path` lies in: the directory under a project's `decks/`, found from the path alone.
 * A source path dek reports is absolute, so no project needs to be resolved to address it. A
 * deck that is not there, such as the one a `deck "nope" not found` points at, is none, and a
 * ref's deck, in a snapshot as dek writes one, is named by the ref, as every command that reads
 * one takes it.
 */
export function deckAround(path: string): HintDeck | undefined {
  for (let dir = path; dirname(dir) !== dir; dir = dirname(dir)) {
    const parent = dirname(dir);
    const root = dirname(parent);
    if (basename(parent) === "decks" && existsSync(join(root, "dek.toml"))) {
      return statSync(dir, { throwIfNoEntry: false })?.isDirectory()
        ? { name: snapshotName(root) ?? basename(dir), dir }
        : undefined;
    }
  }
  return undefined;
}
