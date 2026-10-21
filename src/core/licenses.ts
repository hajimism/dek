import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The licenses `[pack] license` may name, by SPDX id, each with its legal code as Creative
 * Commons publishes it in src/core/licenses/. Creative Commons dedicates the text of its licenses
 * to the public domain, so dek ships them as they are.
 */
export const PACK_LICENSES = ["CC0-1.0", "CC-BY-4.0"] as const;

export type PackLicense = (typeof PACK_LICENSES)[number];

export function isPackLicense(id: string): id is PackLicense {
  return (PACK_LICENSES as readonly string[]).includes(id);
}

/** The legal code of a license, to be written as the LICENSE of a pack. */
export function licenseText(id: PackLicense): string {
  return readFileSync(join(import.meta.dir, "licenses", `${id}.txt`), "utf8");
}
