// A version as the pages and the API read it, and the pictures of it the app serves at
// /i/<deck>/<n>/<name>: `cover`, or `s-<slug>` for a slide with every beat shown.

import { SlideMap } from "../../../../../../src/pub/protocol.ts";
import { readJson } from "../../../common/json.ts";
import { ChangedSlugs, FileHashes, ShotHashes, type Version, type VersionRow } from "./type.ts";

/** The minutes in a manifest's `duration`, such as `12m`; none when it gives none. */
export function minutesOf(duration: string | undefined): number | null {
  return duration === undefined ? null : Number.parseInt(duration, 10);
}

export function versionOf(row: VersionRow): Version {
  return {
    ...row,
    slideMap: readJson(SlideMap, row.slideMap),
    files: readJson(FileHashes, row.files),
    shots: readJson(ShotHashes, row.shots),
    changed: readJson(ChangedSlugs, row.changed),
  };
}

export function slidePicture(deckId: string, n: number, slug: string): string {
  return `/i/${deckId}/${n}/s-${slug}`;
}

/** The picture that stands for the version: its cover, else its first slide's. */
export function coverOf(deckId: string, version: Version): string | null {
  if (version.files.cover) {
    return `/i/${deckId}/${version.n}/cover`;
  }
  const first = version.slideMap.slides.find((slide) => version.shots[slide.slug]);
  return first ? slidePicture(deckId, version.n, first.slug) : null;
}

/** The file in the version a picture's name stands for, else null. */
export function pictureFile(name: string): string | null {
  if (name === "cover") {
    return "cover.png";
  }
  return name.startsWith("s-") ? `shots/${name.slice(2)}.png` : null;
}
