import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lintProblems, must, openProject, type Scenario, writeText } from "../scenario.ts";

const SCRIPT = `---
title: "Launch"
---

## Pricing {#pricing}

It is free for small teams, and it stays that way.
`;

const slide = (limit: string): string => `<section class="slide" data-layout="title">
  <h2 class="slide-title">Pricing</h2>
  <p class="price">Free for teams under ${limit}</p>
</section>
`;

const PRICE_RULE = "\n.slide .price {\n  font-size: var(--size-title);\n}\n";

const REF = "refs/file/launch/decks/launch";

/**
 * A deck someone sent as a pack, pinned as the ref file/launch, and a task that reads as an edit
 * to it. A ref is read-only: the change belongs in a deck of the project's own.
 */
export default {
  id: "ref-edit",
  prompt:
    'The launch deck Acme sent us is pinned here as the ref file/launch. Its pricing slide should say "Free for teams under ten" instead of "under five". Make that change and make sure lint passes.',
  async setup(project) {
    const source = await mkdtemp(join(tmpdir(), "dek-eval-source-"));
    try {
      const sender = openProject(source);
      await must(sender.dekc(["init", ".", "--deck", "launch"]), "dekc init");
      await sender.write("decks/launch/script.md", SCRIPT);
      await sender.write(
        "decks/launch/theme.css",
        `${await sender.read("decks/launch/theme.css")}${PRICE_RULE}`,
      );
      for (const path of new Bun.Glob("decks/launch/slides/*.html").scanSync(source)) {
        await rm(join(source, path));
      }
      await sender.write("decks/launch/slides/pricing.html", slide("five"));
      await must(sender.dekc(["pack"], { cwd: "decks/launch" }), "dekc pack");
      await must(project.dekc(["init", ".", "--deck", "talk"]), "dekc init");
      await must(
        project.dekc(["ref", join(source, "decks/launch/dist/launch.tgz")]),
        "dekc ref <file>.tgz",
      );
    } finally {
      await rm(source, { recursive: true, force: true });
    }
  },
  async check(project) {
    const found = await lintProblems(project);
    if ((await project.read(`${REF}/slides/pricing.html`)) !== slide("five")) {
      found.push(`${REF}/slides/pricing.html was edited, though a ref is read-only`);
    }
    if ((await project.read(`${REF}/script.md`)) !== SCRIPT) {
      found.push(`${REF}/script.md was edited, though a ref is read-only`);
    }
    const own = await Promise.all(
      [...new Bun.Glob("decks/*/slides/*.html").scanSync(project.dir)].map((path) =>
        project.read(path),
      ),
    );
    if (!own.some((html) => html?.includes("Free for teams under ten"))) {
      found.push('no deck of the project\'s own has a slide saying "Free for teams under ten"');
    }
    return found;
  },
  solution: [
    "dekc lint file/launch",
    "dekc new launch --theme-from file/launch",
    async (dir) => {
      for (const path of new Bun.Glob("decks/launch/slides/*.html").scanSync(dir)) {
        await rm(join(dir, path));
      }
      await writeText(join(dir, "decks/launch/script.md"), SCRIPT);
      await writeText(join(dir, "decks/launch/slides/pricing.html"), slide("ten"));
    },
    "dekc lint",
  ],
} satisfies Scenario;
