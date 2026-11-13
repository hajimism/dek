// What changed from one version to the next, slide by slide: a slide changed when its title,
// its script, its steps or its picture did. A slide's picture is compared by hash, so a change
// to its HTML or CSS that shows is caught even when its script stayed the same. A slide that
// `dekc mv` renamed is compared with itself under its old name, not listed as removed and added.

import type { SlideMap } from "../../../../../../../src/pub/protocol.ts";

export type SlideChange = { slug: string; change: "added" | "changed" | "removed" };

export type VersionView = { map: SlideMap; shots: Record<string, string> };

export function slideChanges(
  before: VersionView | null,
  after: VersionView,
  renames: ReadonlyArray<{ from: string; to: string }> = [],
): SlideChange[] {
  if (!before) {
    return [];
  }
  const newName = (slug: string): string => {
    let name = slug;
    for (const rename of renames) {
      if (rename.from === name) {
        name = rename.to;
      }
    }
    return name;
  };
  const old = new Map(before.map.slides.map((slide) => [newName(slide.slug), slide]));
  const oldShots = new Map(
    before.map.slides.map((slide) => [newName(slide.slug), before.shots[slide.slug]]),
  );
  const changes: SlideChange[] = [];
  for (const slide of after.map.slides) {
    const was = old.get(slide.slug);
    if (!was) {
      changes.push({ slug: slide.slug, change: "added" });
    } else if (
      was.title !== slide.title ||
      was.script !== slide.script ||
      JSON.stringify(was.steps) !== JSON.stringify(slide.steps) ||
      oldShots.get(slide.slug) !== after.shots[slide.slug]
    ) {
      changes.push({ slug: slide.slug, change: "changed" });
    }
    old.delete(slide.slug);
  }
  for (const slug of old.keys()) {
    changes.push({ slug, change: "removed" });
  }
  return changes;
}
