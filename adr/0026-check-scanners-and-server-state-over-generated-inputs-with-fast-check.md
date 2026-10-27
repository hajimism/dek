# 26. Check scanners and server state over generated inputs with fast-check

Date: 2026-10-27

## Status

Accepted

## Context

Every test in dek was an example someone wrote by hand. The defects found so far clustered where examples reach least: text scanning (CSS, TOML, character references in attribute values, URLs), the hints a diagnostic or an error gives, and the dev server's state across a sequence of joins, moves, and restarts. Each fix added the input that broke, and the next defect was the input beside it: a string cut short by CR after one cut short by LF, a `url()` holding `/*` after one holding a quote.

For most of these, a generator or a model can say what must always hold: a generator of stylesheets knows where each `{` it wrote closes; any way of writing a character decodes back to that character; Bun's own TOML parser reads the keys dek's scanner reports; every page in a room sees the presenter's last move. Checking a statement like that over thousands of generated inputs reaches the inputs nobody thought to write, and shrinking cuts a failing one down to the few characters that matter.

## Decision

**fast-check is a devDependency at an exact version**, 4.10.2, the newest that `bunfig.toml`'s seven-day wait installs ([ADR 19](0019-keep-dependency-code-away-from-the-tokens-that-publish.md)). It brings one package of its own, pure-rand. Neither ships: the package's `files` hold no tests, and nothing under `src/` imports them.

**Every property runs through `tests/helpers/fc.ts`**, so the suite's cost and its seed are one decision:

- A property runs 100 times, or fewer where it names fewer, as one that writes files or runs the CLI does. A synchronous one stops generating after five seconds and passes with the runs it made. An asynchronous one runs every run to its end, however long that takes: fast-check's time limit stops waiting for a run without stopping it, so the run would go on into the next test, writing into its output and failing where no one hears it. It names a count small enough to need no limit instead, and a loaded machine makes it slower rather than shorter.
- The seed is new on each run of the suite, so CI keeps reaching inputs no earlier run did. A failure prints fast-check's report with the counterexample shrunk, what it failed on, and the line that replays it, its own file and test name in it, such as `FC_SEED=1234 FC_PATH=0:1:2 bun test tests/core/css-scan.test.ts -t 'closes every block where it was closed'`: each property is declared with `propertyTest`, which knows both. `FC_NUM_RUNS` runs every property that many times instead, to search harder by hand. Either variable lifts the time limit, since a run asked for by hand is meant to be searched in full. The variables are named for fast-check, outside the `DEK_` namespace [ADR 12](0012-take-github-tokens-and-dek-variables-only-from-what-the-user-sets.md) keeps for dek's users, and only the tests read them. CONTRIBUTING.md says how to replay a failure.
- A property sits in the test file of the module it checks, under a sentence saying what must always hold. A generator more than one file uses lives in `tests/helpers/`. Properties run in-process: none spawns dek or a browser, so the spawn budget and the Chromium tests stay as they are.

**What the properties check:**

- **CSS.** A generator writes stylesheets whose blocks it knows: rules, at-rules nested in rules and in each other, `{}` blocks in custom properties, and in values strings (some cut short by LF, CR, CRLF, or FF), comments, `url()` quoted, unquoted, and broken, escapes, and NUL, with comments and whitespace put between its tokens. `matchBrace` closes every block where it was written; `parseCss` reads each rule with its block, prelude, and declarations where they were written, and the same rules whatever is put between the tokens; `minifyCss` keeps every other token and every break between two, leaves the rules its source has, and changes nothing it already minified.
- **Attribute values.** For any value and any way of writing each character, as itself where it may be, as `&#n;` or `&#xh;` with or without its `;`, or by a name it has, `decodeAttribute` gives the value back, through HTMLRewriter too, and `writtenAt` runs from 0 to the end of what was written, never back, mapping each unit into the text that wrote it. Most of the writings come from `html-entities.ts`, which could hide a wrong entry, so a hand table of the standard's harder rules is mixed in, its expectations written out apart from the decoder: named references with and without their `;`, the numbers 0x80 to 0x9F read as Windows-1252, NUL, surrogates, and numbers past Unicode read as U+FFFD, a legacy name left as written before `=` or a letter, and a NUL and a lone CR as written. The property does not compare with happy-dom, which reads `&ltin` in an attribute as `<in` where the browser leaves it as written; the Chromium corpus in `attribute-value-browser.test.ts` is the browser check.
- **TOML keys.** For documents of tables, arrays of tables, dotted and quoted keys, inline tables, comments, multi-line strings, and arrays and inline tables written over several lines, `scanTomlKeys` reports every key and header on its line with its path and its segments as written, and the paths it reports are those `Bun.TOML.parse` reads.
- **The dev server's state**, against models run with `fc.commands`. Sockets open, close, and send moves, points, and junk through the handlers the server uses, as presenter or audience, while `goto` moves rooms and the script changes or stops parsing: every socket is sent exactly what the model says, in order, and every room stands where it says. Servers start and stop in this process and in others, die, and lose or break their lock files: a project refuses a server exactly while a live one holds it, a lock whose pid is gone or this user may not signal being stale, and its lock reads as the model says.
- **Hints.** Over generated projects (decks whose sections and slide files match or not, a ref or none, dek run at the root or in a deck) and commands naming a deck, a ref, a typo, a missing deck, or none: every error has a hint, and every `dekc` command a hint names exists, with the words its form takes, takes a ref wherever it names one, and runs as written in a fresh copy of the state that produced the hint.

**A defect a property finds is fixed with a hand-written test** of the counterexample beside the property, so it stays checked whatever seed runs.

**What was not chosen:**

- **Generators on `Math.random`, written by hand.** They would need their own seeding and replay, and above all shrinking: a failing stylesheet of 400 characters is hard to read, and fast-check cuts it to the 20 that fail.
- **Another property-based testing library.** JSVerify and testcheck-js are no longer maintained. fast-check is, is typed, needs nothing of the test runner, so it runs under `bun test` as under any, and has model-based testing built in, which the server's state needs.
- **Coverage-guided fuzzing with Jazzer.js.** It instruments code through Node's module loader and runs under Jest or its own CLI, not under `bun test` or Bun's runtime, the one dek supports.
- **Mutation testing with Stryker.** It has no runner for `bun test`, and its TypeScript checker is built on the compiler API that TypeScript 7's native compiler does not have. It measures how much the tests check rather than finding defects; it is worth another look when it runs on Bun.
- **A fixed seed in CI.** Every run would check the same inputs; a new seed each run searches further, and the printed seed makes any failure reproducible.

## Consequences

The properties add about 4 seconds to `bun test` on a loaded laptop, most of it the hints, which run the CLI and every command a hint names, and the lock, which writes files. A defect a new seed finds can fail CI on a pull request that did not cause it; it is a defect in dek all the same, and the report says how to replay it, so a red run is never dismissed as flaky without replaying it.

The generators encode what dek's readers promise, so teaching a reader a new form means teaching its generator too. What a generator leaves out is said beside it: `scanTomlKeys` keeps a basic-quoted key with an escape raw, and reports no key of an inline table inside an array, so neither is generated.

The properties found defects that are fixed with this record: a prelude that ends on a string lost it, so `dekc show` printed `@keyframes "pop"` as `@keyframes`; `minifyCss` joined a CR a string escapes and the newline that ends the string into one CRLF, and let a hex escape a comment ends take the space after the comment, so the minified stylesheet read differently from its source; `scanTomlKeys` read a line inside an array or inline table written over several lines, such as a nested `[1],`, as a header or a key of the file, so dek.toml lint put a misspelled key after it on the wrong line; and hints named a deck that is not there, as `dekc ls nope` after `deck "nope" not found`, a ref by the directory of its snapshot, and, at a project's root, a command for every deck whether or not it has the slide the command names.
