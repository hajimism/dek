# Lint

Lint decides everything a rule can decide. A deck is not done while `dekc lint --visual` fails; passing it means nothing measurable is wrong, not that the deck is good. The balance of the slides, the argument, and the timing are judged by reading the sheet and the script, and finally by the author. The dev server lints on every save, so a deck you are working on is always passing or telling you why not. You rarely run `dekc lint` by hand; it exists for CI and for checking one slide.

```bash
dekc lint
dekc lint --fix
dekc lint --visual
dekc lint --format sarif
dekc check architecture --shot
```

`--fix` syncs first: it creates skeleton HTML for missing slides (`DEKC001`). It never touches a slide you have edited; only an untouched skeleton is rewritten or removed.

## Layers

dekc delegates general Markdown hygiene to [rumdl](https://github.com/rvben/rumdl) and writes only the rules rumdl cannot know about. rumdl is optional: dekc uses `DEKC_RUMDL` when it is set, else looks for it on `PATH` and then in the `node_modules/.bin` dekc itself is installed in (never the current directory's, which a cloned repository could fill), and skips it when absent: the text output says `rumdl: skipped (rumdl is not installed)` with a `help:` line on how to install it, `--json` lists it in `"skipped"` with the same reason and hint, and SARIF reports it as a tool execution notification. `dekc init` writes a `.rumdl.toml` that disables the first-line-heading rule, since a script starts with frontmatter and `##`.

| Layer | Covers |
| --- | --- |
| Markdown style | rumdl |
| Schema | Frontmatter and config, validated with Zod |
| Consistency | `script.md` ↔ `slides/*.html`, beats ↔ `data-step` |
| Theme contract | Unknown classes, inline styles, tokens, scoping, slide stylesheets |
| Slide scripts | `slides/<id>.ts` evaluated apart from Node and Bun |
| Self-containment | Remote URLs, missing files, paths outside the deck |
| Rendering | Overflow and contrast, measured in a browser |
| Narration | Only for decks with `voice/` |
| Length | Only for decks with a `duration` |

## `--visual`

Overflow (`DEKC030`) and contrast (`DEKC031`) are measured in a real browser through Playwright. Both are questions of geometry with definite answers. dekc does not show a screenshot and ask whether the text fits; it measures. Every beat of every slide is rendered in one browser session, and what each page measured is kept in the deck's `.cache/visual`, named by a hash of all that decides it: the page as rendered, with its theme, CSS, script, and assets, and the code that measures. A page measured before is not measured again, so after the first run `--visual` costs only the slides you changed. Contrast is read from the pixels as drawn, so text over a gradient, an image, or a glow is judged by what the audience sees; see [DEKC031](/reference/lint#dekc031).

A finding names what to fix: the element, the start of its text, and the amount.

```
slides/objection.html: DEKC030 li "https://example.com/very…" overflows the right edge by 102px at steps slow, vague
  help: shorten it, or let it wrap with overflow-wrap: anywhere in slides/objection.css
slides/objection.html: DEKC031 p.note "補足" has contrast 1.5 (#333333 on #111111), below 4.5:1 at steps slow, vague
  help: theme.css alone draws it below 4.5:1: fix the pair in theme.css, where one change reaches every slide that uses it
```

A list that runs off the bottom is one finding for the list, not one per item: a child is reported only for an edge its parent stays inside. The same finding on several beats is reported once, with every beat named. A string that cannot wrap, such as a URL, counts even when its box fits.

Contrast thresholds follow WCAG AA. Body text needs 4.5:1. Large text, meaning 24px or larger, or 18.66px and bold, needs 3:1. That is what lets a big number in a soft color pass while the same color on body text fails.

Without `--visual`, `dekc lint` says so: `visual` is in `"skipped"`, and the text output ends with `visual: skipped`, with the command that measures. A clean lint that did not measure is never mistaken for one that did. Without Playwright, only the commands that need it fail, each with the install command in its hint. The rest of the CLI runs.

- `dekc lint --visual` is a verdict. It returns diagnostics (SARIF with `--format sarif`), and it is the primary way an agent checks its own output.
- `dekc shot` is an observation, not a verdict. Whether a slide looks good stays a human call.

## Voice does not change what failing means

`DEKC040` (an English word missing from the pronunciation dictionary) and `DEKC042` (a beat that shows something but says nothing) apply only to decks with `voice/`. `DEKC041` compares the talk's length with the `duration` budget: the narrated length when a Timeline exists, otherwise the reading-time estimate `dekc ls` shows, which gets a wider margin (35% instead of 20%) because it leaves out pauses and demos. `DEKC043` (a `[beats]` key in `voice.toml` that matches nothing) applies only to decks with `voice/`. All four are warnings: they are reported, and they do not fail lint. Adding voice never turns a passing live-only deck into a failing one.

## Output

Diagnostics are SARIF 2.1.0 so that VS Code, CI, and agents all read the same format. rumdl's results are merged in as a second run. Humans get ESLint-style text by default.

Wherever the fix is known, a diagnostic carries a `hint`: the beat ids a `data-step` may use, the classes a slide may use, the `assets/` path for a remote image. Text output prints it as a `help:` line, `--json` as a `hint` field, and SARIF as `properties.hint`, next to `slug` and `data`.

Every diagnostic has a `severity`, `error` or `warning`. Only errors fail: `dekc lint` and `dekc check` exit 1 and return `"ok": false` when at least one error remains, and warnings alone exit 0 with `"ok": true`. Text output labels a warning after its rule id, and SARIF sets `level`. Diagnostics from rumdl count as errors.

A diagnostic points at the file to change: `DEKC001` at the section heading in `script.md`, rules about slide HTML at the line and column of the offending element, attribute, or URL. Lint reports every occurrence, not the first of each kind, so one run lists everything to fix. The values the message names are also in a `data` field, so an agent reads `{ "class": "headline" }` or `{ "edges": { "bottom": 591 }, "steps": ["1"] }` instead of parsing the message.

```json
{
  "id": "DEKC031",
  "severity": "error",
  "message": "p.note \"補足\" has contrast 1.5 (#333333 on #111111), below 4.5:1 at step 1",
  "path": "slides/objection.html",
  "slug": "objection",
  "hint": "theme.css alone draws it below 4.5:1: fix the pair in theme.css, where one change reaches every slide that uses it",
  "data": { "box": "p.note", "text": "補足", "ratio": 1.5, "threshold": 4.5, "fg": "#333333", "bg": "#111111", "origin": "theme", "steps": ["1"] }
}
```

```bash
dekc lint --format sarif > results.sarif
```

Every rule is listed in [Lint Rules](/reference/lint).

## Next

Step through the deck and export it: [Presenting](./present).
