// A person's name, as their profile, their talks and their comments show it. Better Auth keeps
// it; dek.pub says what it may be.

/** The longest name, in characters. */
export const MAX_NAME_LENGTH = 50;

/** What keeps a string from being a name. */
export type NameProblem = "empty" | "too_long";

/** Control characters, which no page could show. */
// biome-ignore lint/suspicious/noControlCharactersInRegex: they are what it finds.
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

/** `input` as a name: control characters dropped, spaces trimmed and each run of them made one. */
export function readName(
  input: string,
): { ok: true; name: string } | { ok: false; problem: NameProblem } {
  const name = input.replace(CONTROL, "").replace(/\s+/g, " ").trim();
  if (name === "") {
    return { ok: false, problem: "empty" };
  }
  if ([...name].length > MAX_NAME_LENGTH) {
    return { ok: false, problem: "too_long" };
  }
  return { ok: true, name };
}
