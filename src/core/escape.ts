export function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function escapeAttr(text: string): string {
  return escapeHtml(text);
}

/** `text` matched literally inside a regular expression. */
export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * A word no shell reads anything in: letters, marks, and digits of any script, and `@%+=:,./_-`,
 * but not first an `=`, which zsh reads as the path of the program named after it.
 */
const PLAIN_WORD = /^[\p{L}\p{M}\p{N}@%+:,./_-][\p{L}\p{M}\p{N}@%+=:,./_-]*$/u;

/** A backtick, as a shell word that holds none: `printf` writes it from its octal code. */
const BACKTICK_WORD = `"$(printf '\\140')"`;

/**
 * `word` as one shell word, as dek writes it in a command to paste: as it is when it is plain,
 * else single-quoted. A command is printed inside a code span, which a backtick would close, so a
 * backtick is written as `printf` of its code, between quoted runs. The quoting is a POSIX shell's,
 * as sh, bash, and zsh read it: fish reads a backslash in single quotes apart, and PowerShell and
 * cmd quote otherwise. A name from a file goes through `shellName` instead.
 */
export function shellQuote(word: string): string {
  if (PLAIN_WORD.test(word)) {
    return word;
  }
  const quoted = word
    .split("`")
    .map((run) => (run === "" ? "" : `'${run.replaceAll("'", "'\\''")}'`))
    .join(BACKTICK_WORD);
  return quoted === "" ? "''" : quoted;
}

/**
 * A name from a file, such as a deck's folder or a slide's file, as a word in a command dek
 * suggests, or nothing when it has none: fish reads a quote or a backslash in it apart from a
 * POSIX shell, and a control character would start a line of its own. The command then shows a
 * placeholder, such as `<deck>`, and says where the name is.
 */
export function shellName(name: string): string | undefined {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: a control in a name is the problem.
  return /['\\\x00-\x1f\x7f-\x9f]/.test(name) ? undefined : shellQuote(name);
}
