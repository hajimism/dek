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
| Theme contract | Unknown classes, inline styles, tokens, scoping |
| Self-containment | Remote URLs, missing images, paths outside the deck |
| Rendering | Overflow and contrast, measured in a browser |
| Narration | Only for decks with `voice/` |
| Length | Only for decks with a Timeline |

## `--visual`

Overflow (`DEK030`) and contrast (`DEK031`) are measured in a real browser through Playwright. Both are questions of geometry with definite answers. dek does not show a screenshot and ask whether the text fits; it measures. Every beat of every slide is rendered in one browser session.

Contrast thresholds follow WCAG AA. Body text needs 4.5:1. Large text, meaning 24px or larger, or 18.66px and bold, needs 3:1. That is what lets a big number in a soft color pass while the same color on body text fails.

Without Playwright, only the commands that need it fail, each with the install command in its hint. The rest of the CLI runs.

- `dek lint --visual` is a verdict. It returns SARIF, and it is the primary way an agent checks its own output.
- `dek shot` is an observation, not a verdict. Whether a slide looks good stays a human call.

## The definition of done does not change with voice

`DEK040` (an English word missing from the pronunciation dictionary) and `DEK042` (a beat that shows something but says nothing) apply only to decks with `voice/`. `DEK041` (narrated length far from the `duration` budget) applies only when a Timeline exists. All three are warnings. A live-only deck that passes lint is finished, and adding voice never changes that.

## Output

Diagnostics are SARIF 2.1.0 so that VS Code, CI, and agents all read the same format. rumdl's results are merged in as a second run. Humans get ESLint-style text by default.

```bash
dek lint --format sarif > results.sarif
```

Every rule is listed in [Lint Rules](/reference/lint).

## Next

Step through the deck and export it: [Presenting](./present).
