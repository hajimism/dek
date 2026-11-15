/** Every API key dek.pub hands out starts with this, so a leaked one is easy to search for. */
export const API_KEY_PREFIX = "dekpub_";

/** The longest name a key keeps; a longer one is cut. */
export const MAX_KEY_NAME_LENGTH = 64;

/** What a key is called when it is given no name: one an older dekc made, or a script. */
const UNNAMED_KEY = "dekc";

/**
 * The name a key is listed by, from the one `dekc pub login` sends, its machine's: with no control
 * or format characters, each run of spaces made one, and cut to MAX_KEY_NAME_LENGTH.
 */
export function keyName(input: string | undefined): string {
  const name = [
    ...(input ?? "")
      .replace(/[\p{Cc}\p{Cf}]/gu, " ")
      .replace(/\s+/g, " ")
      .trim(),
  ]
    .slice(0, MAX_KEY_NAME_LENGTH)
    .join("")
    .trim();
  return name === "" ? UNNAMED_KEY : name;
}
