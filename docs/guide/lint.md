# Lint

Passing lint is the definition of done. The dev server lints on every save, so a deck you are working on is always passing or telling you why not. You rarely run `dek lint` by hand; it exists for CI and for checking one slide.

```bash
dek lint
dek lint --fix
dek lint --visual
dek lint --format sarif
dek check architecture --shot
```

`--fix` creates skeleton HTML for missing slides (`DEK001`). It never edits an existing file.

## Layers

dek delegates general Markdown hygiene to [rumdl](https://github.com/rvben/rumdl) and writes only the rules rumdl cannot know about. rumdl is optional: dek looks for it on `PATH`, in `node_modules/.bin`, or at `DEK_RUMDL`, and skips it quietly when absent. `dek init` writes a `.rumdl.toml` that disables the first-line-heading rule, since a script starts with frontmatter and `##`.

| Layer | Covers |
| --- | --- |
| Markdown style | rumdl |
| Schema | Frontmatter and config, validated with Zod |
| Consistency | `script.md` ↔ `slides/*.html`, beats ↔ `data-step` |
| Theme contract | Unknown classes, inline styles, tokens, scoping, slide stylesheets |
| Slide scripts | `slides/<id>.ts` evaluated in a sandbox |
| Self-containment | Remote URLs, missing images, paths outside the deck |
| Rendering | Overflow and contrast, measured in a browser |
| Narration | Only for decks with `voice/` |
| Length | Only for decks with a Timeline |

## `--visual`

Overflow (`DEK030`) and contrast (`DEK031`) are measured in a real browser through Playwright. Both are questions of geometry with definite answers. dek does not show a screenshot and ask whether the text fits; it measures. Every beat of every slide is rendered in one browser session.

A finding names what to fix: the element, the start of its text, and the amount.

```
slides/objection.html: DEK030 li "https://example.com/very…" overflows the right edge by 102px at steps slow, vague
  help: shorten it, or let it wrap with overflow-wrap: anywhere in slides/objection.css
slides/objection.html: DEK031 p.note "補足" has contrast 1.5 (#333333 on #111111), below 4.5:1 at steps slow, vague
  help: raise the contrast of its color against the background to 4.5:1
```

A list that runs off the bottom is one finding for the list, not one per item: a child is reported only for an edge its parent stays inside. The same finding on several beats is reported once, with every beat named. A string that cannot wrap, such as a URL, counts even when its box fits.

Contrast thresholds follow WCAG AA. Body text needs 4.5:1. Large text, meaning 24px or larger, or 18.66px and bold, needs 3:1. That is what lets a big number in a soft color pass while the same color on body text fails.

Without Playwright, only the commands that need it fail, each with the install command in its hint. The rest of the CLI runs.

- `dek lint --visual` is a verdict. It returns SARIF, and it is the primary way an agent checks its own output.
- `dek shot` is an observation, not a verdict. Whether a slide looks good stays a human call.

## The definition of done does not change with voice

`DEK040` (an English word missing from the pronunciation dictionary) and `DEK042` (a beat that shows something but says nothing) apply only to decks with `voice/`. `DEK041` compares the talk's length with the `duration` budget: the narrated length when a Timeline exists, otherwise the reading-time estimate `dek ls` shows, which gets a wider margin (35% instead of 20%) because it leaves out pauses and demos. `DEK043` (a `[beats]` key in `voice.toml` that matches nothing) applies only to decks with `voice/`. All four are warnings: they are reported, and they do not fail lint. A live-only deck that passes lint is finished, and adding voice never changes that.

## Output

Diagnostics are SARIF 2.1.0 so that VS Code, CI, and agents all read the same format. rumdl's results are merged in as a second run. Humans get ESLint-style text by default.

Wherever the fix is known, a diagnostic carries a `hint`: the beat ids a `data-step` may use, the classes a slide may use, the `assets/` path for a remote image. Text output prints it as a `help:` line, `--json` as a `hint` field, and SARIF appends it to the message.

Every diagnostic has a `severity`, `error` or `warning`. Only errors fail: `dek lint` and `dek check` exit 1 and return `"ok": false` when at least one error remains, and warnings alone exit 0 with `"ok": true`. Text output labels a warning after its rule id, and SARIF sets `level`. Diagnostics from rumdl count as errors.

A diagnostic points at the file to change: `DEK001` at the section heading in `script.md`, rules about slide HTML at the line of the offending attribute. The values the message names are also in a `data` field, so an agent reads `{ "class": "headline" }` or `{ "edges": { "bottom": 591 }, "steps": ["1"] }` instead of parsing the message.

```json
{
  "id": "DEK031",
  "severity": "error",
  "message": "p.note \"補足\" has contrast 1.5 (#333333 on #111111), below 4.5:1 at step 1",
  "path": "slides/objection.html",
  "slug": "objection",
  "hint": "raise the contrast of its color against the background to 4.5:1",
  "data": { "box": "p.note", "text": "補足", "ratio": 1.5, "threshold": 4.5, "fg": "#333333", "bg": "#111111", "steps": ["1"] }
}
```

```bash
dek lint --format sarif > results.sarif
```

Every rule is listed in [Lint Rules](/reference/lint).

## Next

Step through the deck and export it: [Presenting](./present).
