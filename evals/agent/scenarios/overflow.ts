import { join } from "node:path";
import { lintProblems, must, type Scenario, writeText } from "../scenario.ts";

const POINTS = [
  "dek reads every paragraph you will say",
  "It counts the words in each beat",
  "It divides them by your speaking rate",
  "It adds a pause at every beat",
  "It adds a longer pause at every slide",
  "It sums the beats into slides",
  "It sums the slides into the talk",
  "It compares the sum with the duration",
  "It warns when the talk runs long",
  "It warns when the talk runs short",
  "It reads the rate from the frontmatter",
  "It keeps the estimate next to the budget",
  "It prints both with dekc ls",
  "It updates them every time you save",
  "It never guesses what you did not write",
  "It leaves the judgement of pace to you",
];

const SLIDE = `<section class="slide" data-layout="default">
  <h2 class="slide-title">The clock</h2>
  <ul>
${POINTS.map((point) => `    <li>${point}</li>`).join("\n")}
  </ul>
</section>
`;

/** A list too long for its slide (DEK030), where every point must stay in the talk. */
export default {
  id: "overflow",
  prompt:
    "The timing slide in the talk deck runs off the bottom of the screen. Fix it so lint passes with the visual checks on, and keep every point on it in the talk.",
  needsBrowser: true,
  async setup(project) {
    await must(project.dekc(["init", ".", "--deck", "talk"]), "dekc init");
    await project.write("decks/talk/slides/timing.html", SLIDE);
  },
  async check(project) {
    const found = await lintProblems(project, { visual: true });
    const slides = await Promise.all(
      [...new Bun.Glob("decks/talk/slides/*.html").scanSync(project.dir)].map((path) =>
        project.read(path),
      ),
    );
    const text = slides.join("\n");
    const lost = POINTS.filter((point) => !text.includes(point));
    return [...found, ...lost.map((point) => `"${point}" is gone from the talk`)];
  },
  solution: [
    "cd decks/talk && dekc lint --visual",
    (dir) =>
      writeText(join(dir, "decks/talk/slides/timing.css"), ".slide ul {\n  font-size: 0.8em;\n}\n"),
    "cd decks/talk && dekc lint --visual",
  ],
} satisfies Scenario;
