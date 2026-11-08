# 37. Run a project's plugins in dekc check, for the slide it checks

Date: 2026-11-07

## Status

Accepted

Amends [32. Let a plugin the user installed check a deck, and pin in the project what it promised](0032-let-a-plugin-the-user-installed-check-a-deck-and-pin-in-the-project-what-it-promised.md)

Amends [36. Ship dek-words, a check for a project's word list, as the second official plugin](0036-ship-dek-words-a-check-for-a-project-s-word-list-as-the-second-official-plugin.md)

## Context

ADR 32 ran plugins only in `dekc lint`, with one reason: rumdl does not run in `dekc check` either. ADR 36 then put a team's word list "where the agent already stops", and took that to be `dekc lint`. Its consequences said so: an agent working one slide at a time sees the findings when it lints the deck.

The agent does not stop there first. The loop `AGENTS.md` gives it is to write a slide, run `dekc check <slug>`, and look at `dekc shot`, and `dekc lint --visual` comes when the deck is done. An agent that used dek-words on a new Japanese deck wrote 効く, 潰す, ──, and 溶かす into one slide. `dekc check` on it printed `no diagnostics`; `dekc lint` printed four warnings. The agent moved on from each slide with a pass, and met every listed word at once at the end, which is the review of a whole deck that ADR 36 set out to replace.

Worse than the miss, `dekc check` said nothing about it. A check that did not run is reported as skipped, never as a pass ([Agent Usability Criteria](../docs/guide/agent-criteria.md), 3), and `dekc check` already lists `visual` and `voice` that way. It listed no plugin, so its empty result read as a pass for checks that never ran.

What it would cost was measured. A plugin checks a whole deck: `CheckInput` names every slide, and dek-words reads `script.md` as well. On a deck of three slides, `dekc lint` with dek-words took 0.9 seconds, and `dekc check` 0.6 seconds once dek-words ran in it, beside a browser that measures the slide.

## Decision

**`dekc check <slug>` runs each plugin the project pinned, as `dekc lint` does, on the deck the slide is in, and reports what is on that slide.** The protocol does not change: the plugin gets the whole deck, as in lint, so a plugin written for lint is right for check unchanged. It runs while the browser measures the slide.

**A finding is on a slide** when it is in the slide's HTML, CSS, or TypeScript, or in the slide's section of `script.md`: from its `##` heading, the heading included, to the next one. dek already places its own findings in `script.md` on the section they are in; a plugin's are placed the same way, in `dekc lint` too, where they gain the `slug` field.

**`dekc check` keeps:**

- the plugin's findings on the slide;
- its errors on no slide, such as a data file that does not read (`WORDS002`) or a plugin that failed (`DEK046`). A slide's findings may rest on that file, so leaving it out would pass a slide no plugin really checked. An error fails the check, as in lint.

It drops findings on other slides, and warnings on no slide, such as one in `script.md` above the first heading; those are `dekc lint`'s, as dek's own findings about the deck are.

**A plugin that cannot run is listed in `skipped`**, in the same shape as lint's: `{ "check": "plugin", "plugin": "<name>", "reason", "hint" }`. That is a value `SkippedCheck` already has, so the `--json` shape of `dekc check` widens and does not break.

**A plugin that hangs is stopped after 30 seconds and is `DEK046`,** as in lint. Lint goes on to run it on no deck after; `dekc check` reads one deck, so there is nothing after.

**What does not change:**

- **rumdl stays out of `dekc check`.** Its findings are on `script.md` as a Markdown file, not on a slide, and no agent's loop has been seen to need them before lint.
- **The dev server and `dekc build` run no plugin.** A plugin is a program the user installed, and the dev server runs on every save; ADR 32's reasons for keeping it there out hold.
- **The severity of a plugin's rules is the plugin's.** ADR 36 made a listed word a warning, and the agent now sees it while the slide is still the one it is writing.

**What was not chosen:**

- **Only listing each plugin under `skipped` in `dekc check`.** It would end the false pass, but every check would print the same note for the life of a project, and the agent would still meet the findings at the end.
- **Passing the plugin the one slide.** A new protocol field would make every plugin handle it, and dek-words reads `script.md` whichever slide is asked about. Filtering what a deck's check returns costs a plugin nothing.
- **Keeping every finding with no slide.** A warning about the deck as a whole would show on each slide's check, as dek's own deck-level warnings do not.

## Consequences

- **The agent sees a team's conventions on the slide it is writing.** A listed word, a sticker that lost its word, or a list that does not read shows in the `dekc check` it already runs, with the place and the hint.
- **`dekc check` no longer passes a slide a plugin did not check.** Either the plugin ran, or `skipped` says why not.
- **`dekc check` takes as long as the slowest plugin's check of the whole deck,** when that is longer than the browser takes. A plugin that is slow on a large deck now slows every `check`, not one lint.
- **ADR 36's consequence that "findings run only in `dekc lint`" no longer holds,** nor does the line in ADR 32 that keeps plugins out of `dekc check`. The rest of both stands.
- **A plugin's finding in `script.md` carries `slug` in `dekc lint` too.** It is an optional field `Diagnostic` already has.
- **The `AGENTS.md` block that lists plugins says `dekc check` reports them,** and each plugin's line names its rules without naming one command, so every project's `AGENTS.md` changes on its next `dekc sync`.
