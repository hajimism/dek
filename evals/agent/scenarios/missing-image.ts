import { lintProblems, must, type Scenario } from "../scenario.ts";

const LOGO =
  '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><circle cx="120" cy="120" r="110" fill="#f5f5f5"/></svg>\n';

const SLIDE = `<section class="slide" data-layout="default">
  <h2 class="slide-title">Your turn</h2>
  <img class="figure figure-small" src="assets/logo.svg" alt="The conference logo">
</section>
`;

/** A picture the slide names that is in the project's assets/ but not the deck's (DEK021). */
export default {
  id: "missing-image",
  prompt:
    "The logo on the last slide of the talk deck does not show up. Fix it so lint passes, and keep the logo on the slide.",
  async setup(project) {
    await must(project.dekc(["init", ".", "--deck", "talk"]), "dekc init");
    await project.write("assets/logo.svg", LOGO);
    await project.write("decks/talk/slides/next.html", SLIDE);
  },
  async check(project) {
    const found = await lintProblems(project);
    if ((await project.read("decks/talk/assets/logo.svg")) !== LOGO) {
      found.push("decks/talk/assets/logo.svg is not the project's logo");
    }
    if (!(await project.read("decks/talk/slides/next.html"))?.includes('src="assets/logo.svg"')) {
      found.push("slides/next.html no longer shows assets/logo.svg");
    }
    return found;
  },
  solution: [
    // An agent may run the installed dek through bunx; the shim logs that run too.
    "cd decks/talk && bunx dekc lint",
    "cd decks/talk && cp ../../assets/logo.svg assets/",
    "cd decks/talk && dekc lint",
  ],
} satisfies Scenario;
