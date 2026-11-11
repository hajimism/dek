import { join } from "node:path";
import { skeletonRecord } from "../../../src/core/skeleton-record.ts";
import { lintFindings, must, type Scenario, warned, writeText } from "../scenario.ts";

/** Each section of the talk: its id, and words a slide showing what is said there would carry. */
const SECTIONS: Array<{ slug: string; shows: string[] }> = [
  { slug: "twelve-minutes", shows: ["forty", "40", "eight hours", "8 hours", "batch"] },
  { slug: "profile", shows: ["install", "dependencies", "measure", "timed"] },
  { slug: "cache", shows: ["lockfile", "lock file", "fifteen", "15"] },
  { slug: "split", shows: ["shard", "four", "seventy", "70"] },
  { slug: "ninety-seconds", shows: ["smaller", "batch", "time your", "guess"] },
];

const SCRIPT = `---
# yaml-language-server: $schema=../../.dek/schema.json
title: "Faster CI"
duration: 3m
---

## Twelve minutes {#twelve-minutes}

Last spring, every pull request on our team waited twelve minutes for CI.
That does not sound like much until you count the pushes.
We pushed about forty times a day,
so the team spent eight hours of every day waiting for a green check.
People stopped running the tests before they pushed,
and they started to batch their changes to wait less often.
That made each review bigger, slower, and harder to get right,
and the bugs we shipped got bigger with them.

## Where the time went {#profile}

So we measured before we touched anything.
Everyone had a theory, and most of the theories were about the tests.
We timed every step of the pipeline for a full week instead.
Installing dependencies took five minutes on every single run.
Building took two minutes.
The tests took the other five,
and almost all of that was one slow suite running on a single machine.
The install was the biggest step, and nobody had guessed it.

## Cache what does not change {#cache}

Our dependencies change perhaps once a week,
but we installed them from scratch on every push.
We keyed a cache on the lockfile,
so a push that leaves the lockfile alone restores every package
in about fifteen seconds, and only a real change pays for a fresh install.
That one change took the install from five minutes to fifteen seconds,
and it took us an afternoon to write.

## Split the tests {#split}

Then the tests.
We split the suite into four shards,
balanced by how long each test file took the last time it ran,
and we ran the four shards on four machines at once.
The slowest shard now takes about seventy seconds,
so the tests take seventy seconds instead of five minutes.
Keeping the shards balanced matters more than adding machines:
one heavy shard sets the time for all of them.

## Ninety seconds {#ninety-seconds}

Today a push waits about ninety seconds from start to finish.
Nobody has to batch changes any more, so reviews got smaller,
and people run the tests again before they push.
If you take one thing home from this talk,
start by timing your own pipeline for a week.
The slow step is rarely the one you would guess,
and the fix is often an afternoon of work.
`;

/** Slides a person would make for the script: a claim each, and what is said under it. */
const SLIDES: Record<string, string> = {
  "twelve-minutes": `<section class="slide" data-layout="default">
  <h2 class="slide-title">Twelve minutes a push cost us a working day</h2>
  <ul>
    <li>About forty pushes a day</li>
    <li>Eight hours of waiting, every day</li>
    <li>Changes batched, reviews bigger and slower</li>
  </ul>
</section>
`,
  profile: `<section class="slide" data-layout="default">
  <h2 class="slide-title">We measured before we touched anything</h2>
  <ul>
    <li>Installing dependencies: five minutes</li>
    <li>Building: two minutes</li>
    <li>Tests: five minutes, on one machine</li>
  </ul>
</section>
`,
  cache: `<section class="slide" data-layout="default">
  <h2 class="slide-title">A cache keyed on the lockfile</h2>
  <p>The install went from five minutes to fifteen seconds.</p>
</section>
`,
  split: `<section class="slide" data-layout="default">
  <h2 class="slide-title">Four shards on four machines</h2>
  <p>The tests went from five minutes to seventy seconds.</p>
</section>
`,
  "ninety-seconds": `<section class="slide" data-layout="default">
  <h2 class="slide-title">Ninety seconds a push</h2>
  <ul>
    <li>Smaller reviews</li>
    <li>Tests run again before a push</li>
    <li>Time your own pipeline first</li>
  </ul>
</section>
`,
};

/** Text as a reader sees it, with the markup and the case gone. */
const shown = (html: string): string =>
  html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();

/**
 * The zero-to-one case: a finished script and no slides at all (DEK001 for every section). Done
 * is a slide of the author's own for each section, carrying what is said there, the visual
 * checks clean of their warnings too, and the script as the user wrote it.
 */
export default {
  id: "from-script",
  prompt:
    "decks/talk/script.md is my talk. Make a slide for each part that shows what I say there, and get the deck to pass the visual checks. Don't change the script.",
  needsBrowser: true,
  async setup(project) {
    await must(project.dekc(["init", ".", "--deck", "talk"]), "dekc init");
    for (const path of new Bun.Glob("decks/talk/slides/*").scanSync(project.dir)) {
      await Bun.file(join(project.dir, path)).delete();
    }
    await project.write("decks/talk/script.md", SCRIPT);
  },
  async check(project) {
    const { problems, diagnostics } = await lintFindings(project, { visual: true });
    const found = [...problems, ...warned(diagnostics, ["DEK035", "DEK036", "DEK041"])];
    if ((await project.read("decks/talk/script.md")) !== SCRIPT) {
      found.push("script.md is not the script the user wrote");
    }
    const deckDir = join(project.dir, "decks/talk");
    const record = skeletonRecord(deckDir);
    for (const { slug, shows } of SECTIONS) {
      const html = await project.read(`decks/talk/slides/${slug}.html`);
      if (html === undefined) {
        found.push(`slides/${slug}.html is missing`);
      } else if (record.owns(html, undefined)) {
        found.push(`slides/${slug}.html is still the skeleton dek wrote`);
      } else if (!shows.some((word) => shown(html).includes(word))) {
        found.push(`slides/${slug}.html shows none of what is said in its section`);
      }
    }
    return found;
  },
  solution: [
    "cd decks/talk && dekc lint",
    async (dir) => {
      for (const [slug, html] of Object.entries(SLIDES)) {
        await writeText(join(dir, "decks/talk/slides", `${slug}.html`), html);
      }
    },
    "cd decks/talk && dekc lint --visual",
  ],
} satisfies Scenario;
