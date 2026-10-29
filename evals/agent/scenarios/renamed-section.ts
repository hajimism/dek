import { existsSync } from "node:fs";
import { join } from "node:path";
import { lintProblems, must, type Scenario } from "../scenario.ts";

const WRITTEN = "Thanks for coming to Kyoto";

const SLIDE = `<section class="slide" data-layout="title">
  <h2 class="slide-title">${WRITTEN}</h2>
</section>
`;

/**
 * A heading renamed in script.md before its slide was: the slide is an orphan (DEK002) and the
 * new section has none (DEK001). The rest of the deck is still init's starter.
 */
export default {
  id: "renamed-section",
  prompt:
    'I renamed the first section of the talk deck\'s script to "Welcome", with the id welcome, and now lint fails. Fix it so lint passes, and keep the slide I had already made for that section.',
  async setup(project) {
    await must(project.dekc(["init", ".", "--deck", "talk"]), "dekc init");
    await project.write("decks/talk/slides/intro.html", SLIDE);
    const script = (await project.read("decks/talk/script.md")) ?? "";
    await project.write(
      "decks/talk/script.md",
      script.replace(/^## intro$/m, "## Welcome {#welcome}"),
    );
  },
  async check(project) {
    const found = await lintProblems(project);
    if (!(await project.read("decks/talk/script.md"))?.includes("{#welcome}")) {
      found.push("script.md no longer has the section welcome");
    }
    if (!(await project.read("decks/talk/slides/welcome.html"))?.includes(WRITTEN)) {
      found.push("slides/welcome.html is not the slide the user made");
    }
    if (existsSync(join(project.dir, "decks/talk/slides/intro.html"))) {
      found.push("slides/intro.html is still there");
    }
    return found;
  },
  solution: [
    "cd decks/talk && dekc lint",
    "cd decks/talk && dekc mv intro welcome",
    "cd decks/talk && dekc lint",
  ],
} satisfies Scenario;
