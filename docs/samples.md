# Samples

Three talks about dek, made with dek. They are published on dek.pub by its own account, [@dek](https://dek.pub/@dek), from [`sample/`](https://github.com/hajimism/dek/tree/main/sample), and each link opens the talk's page there. The spoken script is in Japanese.

| Deck | Length | What it is |
| --- | --- | --- |
| [why-dek](https://dek.pub/@dek/why-dek) | 12 min | An explainer that doubles as a handout: every slide states its point and carries its own figure. Swiss editorial on print-friendly paper. |
| [lightning](https://dek.pub/@dek/lightning) | 3 min | A lightning talk that builds a talk in a terminal, with real command output. Amber CRT. |
| [with-agents](https://dek.pub/@dek/with-agents) | 6 min | Handing slides to an AI coding agent: measured verdicts, small files, lint as the stopping point. Product-page UI. |

To present one yourself, build it from `sample/` with `bun run build`, as the [README](https://github.com/hajimism/dek#sample) shows, and open the HTML file in `dist/`. Press `→` or `Space` to go forward and `←` to go back; beats come first, then the next slide. `p` opens the presenter view with the script, `s` hides the slide rail, and `f` goes fullscreen. Open the same deck in a second window and the two follow each other, the way you would put the audience view on a projector. The keys are all in [Presenting](/guide/present#keys).

To see how a slide is made, read its files in [`sample/decks/`](https://github.com/hajimism/dek/tree/main/sample/decks), or pin a deck as a ref and ask dek:

```bash
dekc ref hajimism/dek/why-dek
dekc show hajimism/dek/why-dek timing
```
