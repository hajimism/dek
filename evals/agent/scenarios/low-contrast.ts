import { join } from "node:path";
import { lintProblems, must, type Scenario, writeText } from "../scenario.ts";

const FINE_PRINT = "The slides and the script are on the conference site.";

const SLIDE = `<section class="slide" data-layout="default">
  <h2 class="slide-title">Your turn</h2>
  <p class="fine-print">${FINE_PRINT}</p>
</section>
`;

const css = (color: string): string => `.slide {
  --faint: ${color};
}

.slide .fine-print {
  color: var(--faint);
}
`;

/** Text a slide's own stylesheet colors too close to the background (DEK031). */
export default {
  id: "low-contrast",
  prompt:
    "People at the back cannot read the small print on the last slide of the talk deck. Fix it so lint passes with the visual checks on, and keep the small print.",
  needsBrowser: true,
  async setup(project) {
    await must(project.dekc(["init", ".", "--deck", "talk"]), "dekc init");
    await project.write("decks/talk/slides/next.html", SLIDE);
    await project.write("decks/talk/slides/next.css", css("#2a2a2a"));
  },
  async check(project) {
    const found = await lintProblems(project, { visual: true });
    const html = (await project.read("decks/talk/slides/next.html")) ?? "";
    if (!html.includes(FINE_PRINT)) {
      found.push("the small print is gone from slides/next.html");
    }
    if (html.includes("aria-hidden")) {
      found.push("slides/next.html hides text from the checks with aria-hidden");
    }
    return found;
  },
  solution: [
    "cd decks/talk && dekc lint --visual",
    (dir) => writeText(join(dir, "decks/talk/slides/next.css"), css("#bbbbbb")),
    "cd decks/talk && dekc lint --visual",
  ],
} satisfies Scenario;
