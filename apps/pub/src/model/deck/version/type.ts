// A version is one upload of a deck: its builds and pictures in R2, and in D1 what the talk page,
// the dashboard and comments read of it. Its JSON columns are read back through these shapes.

import type { renames, versions } from "@schema";
import { z } from "zod";
import { type SlideMap, VERSION_FILES } from "../../../../../../src/pub/protocol.ts";

export type VersionRow = typeof versions.$inferSelect;
export type RenameRow = typeof renames.$inferSelect;

/** sha256 of each file of the version, by its name in the upload. */
export const FileHashes = z.partialRecord(z.enum(VERSION_FILES), z.string());

/** sha256 of each slide's picture, by slug. */
export const ShotHashes = z.record(z.string(), z.string());

/** The slugs whose slide or script differs from the version before. */
export const ChangedSlugs = z.array(z.string());

export type Version = Omit<VersionRow, "slideMap" | "files" | "shots" | "changed"> & {
  slideMap: SlideMap;
  files: z.infer<typeof FileHashes>;
  shots: z.infer<typeof ShotHashes>;
  changed: z.infer<typeof ChangedSlugs>;
};
