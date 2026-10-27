/**
 * The words a POSIX shell makes of each command, found by running them with printf in front,
 * which prints each word, the program's name first, and runs nothing else: all in one shell, so
 * a loaded machine starts one process, not one a command. A placeholder such as `<slug>` is a
 * word here, not a redirect.
 */
export function shellWordsOf(commands: string[]): string[][] {
  if (commands.length === 0) {
    return [];
  }
  const script = commands
    .map((command) => `printf '%s\\0' ${command.replace(/<([a-z]+)>/g, "PLACEHOLDER_$1")}`)
    .join("; printf '\\001'\n");
  const result = Bun.spawnSync(["sh", "-c", script], { stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) {
    throw new Error(`sh could not read ${commands.join(" / ")}: ${result.stderr.toString()}`);
  }
  return result.stdout
    .toString()
    .split("\u0001")
    .map((words) =>
      words
        .split("\0")
        .slice(0, -1)
        .map((word) => word.replace(/^PLACEHOLDER_([a-z]+)$/, "<$1>")),
    );
}

/** The words a POSIX shell makes of `command`: see `shellWordsOf`. */
export function shellWords(command: string): string[] {
  return shellWordsOf([command])[0] ?? [];
}

/** Each `dekc ...` command in a hint, in its code span, as a shell splits it. */
export function hintCommands(hint: string | undefined): string[][] {
  return shellWordsOf([...(hint ?? "").matchAll(/`(dekc [^`]*)`/g)].map((match) => match[1] ?? ""));
}

/** Names that hold what a shell or a code span would read: each must come back as one word. */
export const AWKWARD_NAMES = ["My Talk", "a`b", "x`;echo$IFS|sh;`", "$(id)", "a;b&c"];

/** Names no word holds that every shell reads alike: a hint shows a placeholder for each. */
export const UNWRITABLE_NAMES = ["it's", "a\\b", "a\nb", "x`;echo$IFS'hi'|sh;`"];
