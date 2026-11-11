import { join } from "node:path";
import { parseScript, splitFrontmatter } from "../../../src/core/parse.ts";
import { DECK_SETTING_DEFAULTS, type Deck } from "../../../src/core/schema.ts";
import { formatClock, sectionTiming, speechText } from "../../../src/core/timing.ts";
import { lintFindings, must, type Scenario, warned, writeText } from "../scenario.ts";

/** Each section: its heading, what it must say, and what it says on top that the slot has no room for. */
const SECTIONS: Array<{ heading: string; slug: string; core: string; extra: string }> = [
  {
    heading: "Nobody reads the docs",
    slug: "nobody",
    core: `Every team I have worked on said the same thing: nobody reads the docs.
So we stopped writing them, and then we were surprised
when every new person asked the same five questions in their first week.
The docs were not unread because people dislike reading.
They were unread because they did not answer the question in front of them.
A reader arrives with one task and very little patience.
If the first screen does not help with that task, they leave,
and they ask the person sitting next to them instead.`,
    extra: `I counted once. In a single quarter, our team answered the same question
about the staging database thirty one times in chat.
Each answer took ten minutes, and each one was a little different,
so the next person got a slightly different story.
Thirty one answers is more than five hours of senior time,
spent repeating something one page could have said once.
And chat history is a poor archive: search finds the question,
but rarely the answer that turned out to be right.`,
  },
  {
    heading: "Start with an example",
    slug: "examples",
    core: `The fix that helped most was the simplest one: start every page with an example.
Not a description of the options, not the history of the design,
but a command or a snippet the reader can copy and run right now.
Readers learn the shape of a thing from one working example
much faster than from three paragraphs about it.
Once the example works, they read the rest of the page to change it,
and that is when the explanation finally lands.`,
    extra: `We tested this on our own pages.
For a month we moved the example from the bottom of each page to the top,
and we watched what people asked in chat about those pages.
Questions about the pages we changed dropped by about half.
Questions about the pages we left alone stayed where they were.
It was not a careful experiment, but the difference was large enough
that nobody on the team wanted to argue about it.`,
  },
  {
    heading: "One page, one task",
    slug: "tasks",
    core: `The second change was to give every page exactly one task.
A page called configuration that covers everything
helps nobody, because the reader has to find their part first.
A page called how to point the app at a new database
helps exactly the person who needs it, and it can be short.
Short pages are also easier to keep true,
because one change in the product touches only one or two of them.`,
    extra: `Splitting the old pages took longer than we expected.
Our configuration page alone became eleven task pages,
and three of them turned out to describe settings that no longer existed.
Nobody had noticed, because nobody could find those settings in the long page.
We deleted them, and the product team was relieved,
because they had been afraid to remove the code
in case someone somewhere still used it.`,
  },
  {
    heading: "Test the docs",
    slug: "test",
    core: `The last change was to test the docs like code.
Every example on every page runs in our build,
so an example that stops working fails the build the same day.
That one rule did more for trust than anything else we tried.
Once people saw that the examples always worked,
they started to read the docs first and ask in chat second.
Start with an example, give each page one task, and test what you show.`,
    extra: `Getting the examples to run took a few weeks of plumbing.
Some examples needed a database, some needed credentials,
and some only made sense halfway through a longer story.
We gave each page a small setup block that the build runs first,
and we marked the few examples that cannot run as such, with a reason.
Today the build runs about two hundred examples in under a minute,
and it fails a few times a month, always for a reason worth knowing.`,
  },
];

const frontmatter = `---
# yaml-language-server: $schema=../../.dek/schema.json
title: "Docs people read"
duration: 3m
---
`;

const script = (parts: (section: (typeof SECTIONS)[number]) => string[]): string =>
  `${frontmatter}\n${SECTIONS.map((section) =>
    [`## ${section.heading} {#${section.slug}}`, ...parts(section)].join("\n\n"),
  ).join("\n\n")}\n`;

const KEPT = SECTIONS[1] as (typeof SECTIONS)[number];
/** Words from the part the user named, which a cut that keeps that part keeps. */
const KEPT_PHRASE = "start every page with an example";

/** The slot, and how far from it DEK041 lets the reading-time estimate be. */
const BUDGET_SECONDS = 180;
const ESTIMATE_DRIFT_RATIO = 0.35;

/** A key that sets the speaking rate, in YAML or TOML, which would time the same words shorter. */
const RATE_KEY = /\b(?:cjk|latin)_per_minute\b/;

/** A blockquote line's markers, which the timing leaves out with the line. */
const QUOTE_MARKERS = /^[ \t]*(?:>[ \t]?)+/gm;

/**
 * How long the script reads as dek times it at its default rate, the blockquotes read as well:
 * what it says, however the deck sets its rate or hides lines from the timing.
 */
function defaultReading(text: string): number {
  const deck = parseScript(text.replace(QUOTE_MARKERS, ""));
  return sectionTiming({ ...deck, ...DECK_SETTING_DEFAULTS }).reduce(
    (sum, row) => sum + row.estimateSeconds,
    0,
  );
}

const slide = (heading: string): string => `<section class="slide" data-layout="title">
  <h2 class="slide-title">${heading}</h2>
</section>
`;

/**
 * A script that runs about 1.6 times its three minutes (DEK041, a warning lint passes with). Done
 * is a script that fits the slot it still asks for, with the part the user named kept, and its
 * slides still matching its sections. The script must fit at dek's default rate with nothing
 * hidden from the timing: a faster rate in the frontmatter or dek.toml, or what was cut kept as a
 * blockquote, silences DEK041 without cutting anything.
 */
export default {
  id: "over-time",
  prompt: `My talk in the talk deck has to fit in three minutes, but the script runs long. Cut the script so it fits; keep the time limit and keep the part about starting with an example.`,
  async setup(project) {
    await must(project.dekc(["init", ".", "--deck", "talk"]), "dekc init");
    for (const path of new Bun.Glob("decks/talk/slides/*").scanSync(project.dir)) {
      await Bun.file(join(project.dir, path)).delete();
    }
    await project.write(
      "decks/talk/script.md",
      script(({ core, extra }) => [core, extra]),
    );
    for (const { heading, slug } of SECTIONS) {
      await project.write(`decks/talk/slides/${slug}.html`, slide(heading));
    }
  },
  async check(project) {
    const { problems, diagnostics } = await lintFindings(project);
    const found = [...problems, ...warned(diagnostics, ["DEK041"])];
    const text = (await project.read("decks/talk/script.md")) ?? "";
    let deck: Deck;
    try {
      deck = parseScript(text);
    } catch (error) {
      return [...found, `script.md cannot be read: ${(error as Error).message}`];
    }
    if (deck.duration !== "3m") {
      found.push(`script.md no longer has duration: 3m, but ${deck.duration ?? "none"}`);
    }
    const { yaml, body } = splitFrontmatter(text);
    const settings: Array<[string, string]> = [
      ["script.md", yaml],
      ["dek.toml", (await project.read("dek.toml")) ?? ""],
    ];
    for (const [path, source] of settings) {
      const key = source.match(RATE_KEY)?.[0];
      if (key) {
        found.push(`${path} sets ${key}, which changes the rate the talk is timed at`);
      }
    }
    if (new RegExp(QUOTE_MARKERS.source, "m").test(body)) {
      found.push("script.md has blockquotes, which the timing leaves out");
    }
    const seconds = defaultReading(text);
    if (Math.abs(seconds - BUDGET_SECONDS) / BUDGET_SECONDS >= ESTIMATE_DRIFT_RATIO) {
      found.push(
        `script.md reads in about ${formatClock(seconds)} at dek's default rate, too far from 3m`,
      );
    }
    const kept = deck.sections.find((section) => section.slug === KEPT.slug);
    if (!kept) {
      found.push(`script.md no longer has the section ${KEPT.slug}, "${KEPT.heading}"`);
    } else if (!speechText(kept).replace(/\s+/g, " ").toLowerCase().includes(KEPT_PHRASE)) {
      found.push(`the section ${KEPT.slug}, "${KEPT.heading}", no longer says "${KEPT_PHRASE}"`);
    }
    return found;
  },
  solution: [
    "cd decks/talk && dekc lint",
    (dir) =>
      writeText(
        join(dir, "decks/talk/script.md"),
        script(({ core }) => [core]),
      ),
    "cd decks/talk && dekc lint",
  ],
} satisfies Scenario;
