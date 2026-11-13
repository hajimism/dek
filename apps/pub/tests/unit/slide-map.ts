// A slide map with one beat per slide, from each slide's slug and paragraphs.

import type { SlideMap } from "../../../../src/pub/protocol.ts";

export const slideMapOf = (slides: Array<[string, string[]]>): SlideMap => ({
  deck: "talk",
  out: "talk.html",
  slides: slides.map(([slug, paragraphs]) => ({
    slug,
    title: slug,
    line: 1,
    steps: [{ step: "0", title: slug }],
    script: paragraphs.join("\n\n"),
    paragraphs,
  })),
});
