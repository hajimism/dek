import { join } from "node:path";
import { must, problems, type Scenario, writeText } from "../scenario.ts";

const CLOCK =
  '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320"><circle cx="160" cy="160" r="150" fill="none" stroke="#f5f5f5" stroke-width="8"/><path d="M160 160V60M160 160h70" stroke="#f5f5f5" stroke-width="8"/></svg>\n';

const slide = (alt: string): string => `<section class="slide" data-layout="default">
  <h2 class="slide-title">The clock</h2>
  <img class="figure figure-small" src="assets/clock.svg"${alt}>
</section>
`;

/**
 * A slide with a picture that says nothing (DEK034), checked "voice included" in a deck with no
 * voice and a machine with no engine. The voice check is skipped, not failed, so the slide is done
 * once the picture says what it shows; setting a voice up here leaves a check that cannot pass.
 */
export default {
  id: "check-without-voice",
  prompt:
    "Check the timing slide of the talk deck, voice included, and fix what you find so it passes.",
  // No engine answers here, whatever runs on the machine.
  env: { DEK_VOICE_URL: "http://127.0.0.1:9" },
  async setup(project) {
    await must(project.dekc(["init", ".", "--deck", "talk"]), "dekc init");
    await project.write("decks/talk/assets/clock.svg", CLOCK);
    await project.write("decks/talk/slides/timing.html", slide(""));
  },
  async check(project) {
    const ran = await project.dekc(["check", "timing", "--voice", "--json"], {
      cwd: "decks/talk",
    });
    const found = problems(ran);
    if (!(await project.read("decks/talk/slides/timing.html"))?.includes("assets/clock.svg")) {
      found.push("slides/timing.html no longer shows the clock");
    }
    return found;
  },
  solution: [
    "cd decks/talk && dekc check timing --voice",
    (dir) => writeText(join(dir, "decks/talk/slides/timing.html"), slide(' alt="A clock face"')),
    "cd decks/talk && dekc check timing --voice",
  ],
} satisfies Scenario;
