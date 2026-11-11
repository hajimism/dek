import { join } from "node:path";
import { textRuns } from "../../../src/core/phrases.ts";
import { skeletonRecord } from "../../../src/core/skeleton-record.ts";
import { lintFindings, must, type Scenario, warned, writeText } from "../scenario.ts";

/**
 * Each section of the talk: its id, and the things said there that a slide showing it would
 * carry, each as the words it may be written in: a figure in digits or spelled out, a word in the
 * forms the script uses. A plural "s" or "es" is taken on any of them.
 */
const SECTIONS: Array<{ slug: string; shows: string[][] }> = [
  {
    slug: "twelve-minutes",
    shows: [
      ["twelve", "12"],
      ["minute", "min"],
      ["forty", "40"],
      ["push", "pushed", "pushing"],
      ["eight", "8"],
      ["hour"],
      ["day", "daily"],
      ["wait", "waited", "waiting"],
      ["batch", "batched", "batching"],
      ["review"],
      ["bug"],
      ["ci"],
      ["pull request"],
    ],
  },
  {
    slug: "profile",
    shows: [
      ["measure", "measured", "measuring"],
      ["time", "timed", "timing"],
      ["step"],
      ["pipeline"],
      ["week"],
      ["install", "installed", "installing"],
      ["dependency", "dependencies", "deps"],
      ["five", "5"],
      ["minute", "min"],
      ["build", "building"],
      ["two", "2"],
      ["test", "suite"],
      ["slow", "slowest"],
      ["machine"],
      ["theory", "theories", "guess", "guessed"],
    ],
  },
  {
    slug: "cache",
    shows: [
      ["cache", "cached", "caching"],
      ["lockfile", "lock file"],
      ["dependency", "dependencies", "deps", "package"],
      ["install", "installed", "installing"],
      ["fifteen", "15"],
      ["second", "sec"],
      ["five", "5"],
      ["minute", "min"],
      ["restore", "restored"],
      ["afternoon"],
    ],
  },
  {
    slug: "split",
    shows: [
      ["split", "splitting"],
      ["shard", "sharded", "sharding"],
      ["four", "4"],
      ["machine", "parallel", "at once"],
      ["seventy", "70"],
      ["second", "sec"],
      ["five", "5"],
      ["minute", "min"],
      ["test", "suite"],
      ["balance", "balanced", "balancing"],
      ["slow", "slowest", "heavy"],
    ],
  },
  {
    slug: "ninety-seconds",
    shows: [
      ["ninety", "90"],
      ["second", "sec"],
      ["twelve", "12"],
      ["minute", "min"],
      ["push"],
      ["batch", "batched"],
      ["review"],
      ["small", "smaller"],
      ["test"],
      ["time", "timing"],
      ["pipeline"],
      ["week"],
      ["guess"],
      ["afternoon"],
    ],
  },
];

/** A slide shows its section when it carries at least this many of the things said there. */
const ENOUGH = 2;

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

/**
 * Text as a reader sees it, read as dek reads a slide's text: character references decoded, what
 * is not drawn as text, such as a stylesheet, left out, and the white space and the case gone.
 */
const shown = (html: string): string =>
  textRuns(html).join(" ").replace(/\s+/g, " ").trim().toLowerCase();

const escaped = (word: string): string => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** How many of `shows` the text carries, each as a whole word: "four" is not in "fourteen". */
function carried(text: string, shows: string[][]): number {
  return shows.filter((forms) =>
    new RegExp(
      `(?<![\\p{L}\\p{N}])(?:${forms.map(escaped).join("|")})(?:e?s)?(?![\\p{L}\\p{N}])`,
      "iu",
    ).test(text),
  ).length;
}

/**
 * The zero-to-one case: a finished script and no slides at all (DEK001 for every section). Done
 * is a slide of the author's own for each section, carrying at least two of the things said
 * there and no copy of another slide, the visual checks clean of their warnings too, and the
 * script as the user wrote it.
 */
export default {
  id: "from-script",
  prompt:
    "decks/talk/script.md is my talk. Make a slide for each part that shows what I say there, and get the deck to pass the visual checks. Don't change the script.",
  needsBrowser: true,
  async setup(project) {
    await must(project.dekc(["init", ".", "--deck", "talk", "--no-install"]), "dekc init");
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
    /** Each slide judged so far, by the text it shows. */
    const seen = new Map<string, string>();
    for (const { slug, shows } of SECTIONS) {
      const html = await project.read(`decks/talk/slides/${slug}.html`);
      if (html === undefined) {
        found.push(`slides/${slug}.html is missing`);
        continue;
      }
      if (record.owns(html, undefined)) {
        found.push(`slides/${slug}.html is still the skeleton dek wrote`);
        continue;
      }
      const text = shown(html);
      if (carried(text, shows) < ENOUGH) {
        found.push(`slides/${slug}.html shows fewer than two of the things said in its section`);
      }
      const same = seen.get(text);
      if (same === undefined) {
        seen.set(text, slug);
      } else {
        found.push(`slides/${slug}.html shows the same text as slides/${same}.html`);
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
