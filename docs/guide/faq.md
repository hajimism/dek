# FAQ

## How do I install it?

dek is not on npm yet. Create a project straight from GitHub with `bunx github:hajimism/dek init`, then install it inside the project with `bun add -d github:hajimism/dek` and use `bunx dek` from there. The package is `@hajimism/dek`; once it is published, `bun add -d @hajimism/dek` will do. See [Getting Started](./getting-started).

## Why does `bunx dek` run something else?

`dek` on npm is an unrelated package. `bunx dek` runs the dek in the project's `node_modules`, and where there is none, it downloads that other package instead. Run `bunx dek` inside a project that has dek installed, or `bunx github:hajimism/dek` anywhere else.

## When should I use Slidev instead?

When you need live coding, Vue components inside slides, npm themes, or an embedded editor. dek is for talks where the speaking carries the weight, and it keeps plain HTML and CSS as its whole surface. The comparison is in [Why dek](./why#how-dek-compares).

## Do I have to write HTML?

No. Write `script.md`, run `dek`, and the skeleton slides in the bundled theme are enough to present. Write HTML when you want the screen to say more than the script does.

## Do I have to use voice?

No. A deck without `voice/` has exactly the same definition of done: lint passes. Voice adds warnings (`DEK040`, `DEK042`, and `DEK043`) only to decks that opt in. `DEK041`, the check against `duration`, applies to every deck that sets one.

## Why do slide files have no numbers?

Only one file may know the order, and that file is `script.md`. Numbered file names would force a rename on every reorder and destroy the diff. Reorder with `dek mv <slug> --before|--after <other>`.

## Does `sync` overwrite my HTML?

Never once you have edited it. It creates skeletons for missing slides, rewrites a skeleton nobody has edited yet when its section changes, and removes such a skeleton when its section is gone. A file you have edited is never touched; if its section is gone, lint flags it as an orphan (`DEK002`). It does not rename either. Renaming is `dek mv`.

## What does an agent call?

The same CLI as a human: `dek help --agent`, `dek check <slug> --shot`, `dek lint --format sarif`. There is no MCP server. See [Working with AI Agents](./ai).

## Can I present without the dev server?

Yes. `dek build` produces one HTML file. Put it on a USB stick. Press `p` or open it with `?presenter`, and a second window follows the first through `BroadcastChannel`. Use `dek --remote` only when another device needs to drive the deck.

## Are Playwright, ffmpeg, and VOICEVOX required?

No. Each is optional, and only the commands that need it fail when it is missing, always with the install step in the hint. `--visual`, `shot`, `pdf`, and `video` use Playwright; `video` also uses ffmpeg; `voice`, `rehearse`, and `video` use a VOICEVOX-compatible engine. Engine setup is in [Voice and Video](./voice#setup).

## Where do I write pauses or silent time?

Not in the script. A beat with no paragraph passes through the transition and the configured `pause.beat`, and nothing else. If you will speak during a demo, write those words in the script so they count toward the estimate. For narration, a longer pause after one beat or slide goes in `voice/voice.toml`; see [Timing](./voice#timing).

## Can a slide run JavaScript?

Not inside its HTML: `<script>` there is `DEK011`. Motion that CSS cannot express, such as a counter or a chart that draws itself, goes in `slides/<id>.ts` as a `draw` function of time. The runtime owns the clock, so the same script plays live, seeks frame by frame in `dek video`, and shows its end state in `dek shot` and the PDF. Clickable demos are out of scope. See [Scripted motion](./steps#scripted-motion).

## Where does CSS for one slide go?

In `slides/<id>.css`, next to the HTML. It is scoped to that slide and does not count toward `max_classes`. See [Slide stylesheets](./slides#slide-stylesheets).
