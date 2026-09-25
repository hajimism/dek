# Samples

Three talks about dek, made with dek. Each link opens the file `dek build` wrote for that deck: one HTML file with every slide, the theme, the images, and the player inside. The site builds them from [`sample/`](https://github.com/hajimism/dek/tree/main/sample) on every deploy, so they always match the source. The spoken script is in Japanese.

| Deck | Length | What it is |
| --- | --- | --- |
| [why-dek](/dek/samples/why-dek.html){target="_self"} | 12 min | An explainer that doubles as a handout: every slide states its point and carries its own figure. Swiss editorial on print-friendly paper. |
| [lightning](/dek/samples/lightning.html){target="_self"} | 3 min | A lightning talk that builds a talk in a terminal, with real command output. Amber CRT. |
| [with-agents](/dek/samples/with-agents.html){target="_self"} | 6 min | Handing slides to an AI coding agent: measured verdicts, small files, lint as the finish line. Product-page UI. |

Press `→` or `Space` to go forward and `←` to go back; beats come first, then the next slide. `p` opens the presenter view with the script, `s` hides the slide rail, and `f` goes fullscreen. Open the same deck in a second window and the two follow each other, the way you would put the audience view on a projector. The keys are all in [Presenting](/guide/present#keys).

To see how a slide is made, read its files in [`sample/decks/`](https://github.com/hajimism/dek/tree/main/sample/decks), or pin a deck as a ref and ask dek:

```bash
dek ref hajimism/dek/why-dek
dek show hajimism/dek/why-dek timing
```
