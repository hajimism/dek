import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { must, type Scenario } from "../scenario.ts";

/** The user names a deck one letter off; dek should say which one they meant. */
export default {
  id: "mistyped-deck",
  prompt: "Build the kenote deck into a single HTML file I can send around.",
  async setup(project) {
    await must(project.dekc(["init", ".", "--deck", "keynote"]), "dekc init");
  },
  async check(project) {
    const found: string[] = [];
    const built = ["decks/keynote/dist/keynote.html", "dist/keynote.html"].some((path) =>
      existsSync(join(project.dir, path)),
    );
    if (!built) {
      found.push("no dist/keynote.html was built");
    }
    const decks = readdirSync(join(project.dir, "decks"));
    if (decks.join() !== "keynote") {
      found.push(`decks/ holds ${decks.join(", ")}, not only keynote`);
    }
    return found;
  },
  solution: ["dekc build kenote", "dekc build keynote"],
} satisfies Scenario;
