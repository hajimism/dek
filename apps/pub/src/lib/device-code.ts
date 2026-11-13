// The code the device flow shows in the terminal: 8 letters and digits, written XXXX-XXXX. People
// type it, paste it, or follow the CLI's link with it, with or without the hyphen, in any case.

const USER_CODE_LENGTH = 8;

/** The code as Better Auth stores it: letters and digits only, upper case. */
export function normalizeUserCode(input: string): string {
  return input
    .replace(/[^a-z0-9]/gi, "")
    .toUpperCase()
    .slice(0, USER_CODE_LENGTH);
}

/** The code as the field shows it while it is typed: a hyphen once a fifth character comes. */
export function formatUserCode(input: string): string {
  const code = normalizeUserCode(input);
  return code.length > 4 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

export function isCompleteUserCode(input: string): boolean {
  return normalizeUserCode(input).length === USER_CODE_LENGTH;
}
