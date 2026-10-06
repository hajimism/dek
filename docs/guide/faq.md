# FAQ

## How do I install it?

Create a project with `bunx @hajimism/dek init`, then install dek inside it with `bun add -d @hajimism/dek` and use `bunx dekc` from there. See [Getting Started](./getting-started).

## Why does `bunx dek` run something else?

The package is `@hajimism/dek`; the command it installs is `dekc`, not `dek`. `dek` on npm is an unrelated package, and `bunx dek` downloads and runs it. Inside a project, `bunx dekc` runs the dek installed there; outside one, use `bunx @hajimism/dek`.

## When should I use Slidev instead?

When you need live coding, Vue components inside slides, npm themes, or an embedded editor. dek is for talks where the speaking carries the weight, and it keeps plain HTML and CSS as its whole surface. The comparison is in [Why dek](./why#how-dek-compares).

## Do I have to write HTML?

No. Write `script.md`, run `dekc`, and the skeleton slides in the bundled theme are enough to present. Write HTML when you want the screen to say more than the script does.

## Do I have to use voice?

No. A deck without `voice/` fails lint for exactly the same reasons as one with it. Voice adds warnings (`DEK040`, `DEK042`, and `DEK043`) only to decks that opt in. `DEK041`, the check against `duration`, applies to every deck that sets one.

## Why do slide files have no numbers?

Only one file may know the order, and that file is `script.md`. Numbered file names would force a rename on every reorder and destroy the diff. Reorder with `dekc mv <slug> --before|--after <other>`.

## Does `sync` overwrite my HTML?

Never once you have edited it. It creates skeletons for missing slides, rewrites a skeleton nobody has edited yet when its section changes, and removes such a skeleton when its section is gone. A file you have edited is never touched; if its section is gone, lint flags it as an orphan (`DEK002`). It does not rename either. Renaming is `dekc mv`.

## What does an agent call?

The same CLI as a human: `dekc help --agent`, `dekc check <slug> --shot`, `dekc lint --format sarif`. There is no MCP server. See [Working with AI Agents](./ai).

## Can I hand a talk to someone who uses PowerPoint?

Yes. `dekc pptx` writes `dist/<deck>.pptx`: one slide per `##`, at its last beat, as the PDF prints it. Each slide is a picture of what the browser drew, with its text laid back over it in text boxes, line by line, so the recipient can fix a word, a date, or a name where it stands; the script goes in the notes. Shapes, SVG diagrams, and decoration stay in the picture, so they cannot be moved or recolored. Add `--public` to leave the stage directions out of the notes. Keynote opens the same file. See [Presenting](./present#pptx).

## Can I present without the dev server?

Yes. `dekc build` produces one HTML file. Put it on a USB stick. Press `p` or open it with `?presenter`, and a second window follows the first through `BroadcastChannel`. Use `dekc --remote` only when another device needs to drive the deck.

## Are Playwright, ffmpeg, and VOICEVOX required?

No. Each is optional, and only the commands that need it fail when it is missing, always with the install step in the hint. `--visual`, `shot`, `pdf`, and `video` use Playwright; `video` also uses ffmpeg; `voice`, `rehearse`, and `video` use a VOICEVOX-compatible engine. Engine setup is in [Voice and Video](./voice#setup).

## Where do I write pauses or silent time?

Not in the script. A beat with no paragraph passes through the transition and the configured `pause.beat`, and nothing else. If you will speak during a demo, write those words in the script so they count toward the estimate. For narration, a longer pause after one beat or slide goes in `voice/voice.toml`; see [Timing](./voice#timing).

## Can a slide run JavaScript?

Not inside its HTML: `<script>` there is `DEK011`. Motion that CSS cannot express, such as a counter or a chart that draws itself, goes in `slides/<id>.ts` as a `draw` function of time. The runtime owns the clock, so the same script plays live, seeks frame by frame in `dekc video`, and shows its end state in `dekc shot` and the PDF. Clickable demos are out of scope. See [Scripted motion](./steps#scripted-motion).

## Where does CSS for one slide go?

In `slides/<id>.css`, next to the HTML. It is scoped to that slide and does not count toward `max_classes`. See [Slide stylesheets](./slides#slide-stylesheets).
