// A setting that holds a list, as `DEK_PUB_INVITED` and `DEK_PUB_OPERATORS` do.

/** The entries of a list setting: split by commas or whitespace, in lowercase, none empty. */
export function listSetting(setting: string): string[] {
  return setting
    .split(/[\s,]+/)
    .map((entry) => entry.toLowerCase())
    .filter(Boolean);
}

/** Whether an entry of a list setting is an email address, as both settings hold them. */
export function isAddressEntry(entry: string): boolean {
  return /^[^@*]+@[^@*]+$/.test(entry);
}
