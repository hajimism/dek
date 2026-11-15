// What a new thread must be opened on: the deck's current version, at a slide, a beat and a
// passage that version has. The store reads the deck and its version; the rules are here.

import type { NewComment, SlideMap } from "../../../../../src/pub/protocol.ts";
import { ApiError } from "../../common/api-error.ts";
import { versionStanding } from "../deck/access.ts";
import { saysQuote } from "./anchor.ts";

/**
 * Refuse a thread `comment` cannot open on the deck, whose current version is `version`; else
 * the version, which the thread is kept on. Every side comments on the current version, and one
 * whose page still shows an older version is told so: the deck no longer holds it. Whether a
 * passage is in the script is the script's to tell, so one it is hidden from, as `seesScript`
 * says, may not quote it at all.
 */
export function mustOpenThread<V extends { n: number; slideMap: SlideMap }>(
  deck: { currentVersion: number | null },
  version: V | null,
  comment: Pick<NewComment, "anchor" | "version">,
  seesScript: boolean,
): V {
  const n = comment.version ?? deck.currentVersion;
  const standing = n === null ? null : versionStanding(deck, n);
  if (standing === "gone") {
    throw new ApiError(
      409,
      "stale_version",
      `version ${n} is no longer the one readers see`,
      "reload the page and comment again",
    );
  }
  if (standing === "unknown") {
    throw new ApiError(422, "unknown_version", `the deck has no version ${n}`);
  }
  if (!seesScript && comment.anchor.targets.some((target) => target.kind === "quote")) {
    throw new ApiError(403, "script_hidden", "the script is not public, so it cannot be quoted");
  }
  if (!version) {
    throw new ApiError(409, "no_version", "the deck has no version to comment on yet");
  }
  const slide = version.slideMap.slides.find((candidate) => candidate.slug === comment.anchor.slug);
  if (!slide) {
    throw new ApiError(422, "unknown_slide", `the deck has no slide ${comment.anchor.slug}`);
  }
  if (!slide.steps.some((step) => step.step === comment.anchor.step)) {
    throw new ApiError(
      422,
      "unknown_step",
      `slide ${slide.slug} has no step ${comment.anchor.step}`,
    );
  }
  for (const target of comment.anchor.targets) {
    if (target.kind === "quote" && !saysQuote(slide.paragraphs, target.quote)) {
      throw new ApiError(
        422,
        "unknown_quote",
        `slide ${slide.slug} does not say the quoted passage`,
      );
    }
  }
  return version;
}
