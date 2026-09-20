# FAQ

## How do I install it?

dek is not on npm. Run it from GitHub with `bunx github:hajimism/dek`, or pin it inside a project with `bun add github:hajimism/dek` and then use `bunx dek`. See [Getting Started](./getting-started).

## When should I use Slidev instead?

When you need live coding, Vue components inside slides, npm themes, or an embedded editor. dek is for talks where the speaking carries the weight, and it keeps plain HTML and CSS as its whole surface. The comparison is in [Why dek](./why#how-dek-compares).

## Do I have to write HTML?

No. Write `script.md`, run `dek`, and the skeleton slides in the bundled theme are enough to present. Write HTML when you want the screen to say more than the script does.

## Do I have to use voice?

No. A deck without `voice/` has exactly the same definition of done: lint passes. Voice adds warnings (`DEK040`, `DEK041`, `DEK042`) only to decks that opt in.

## Why do slide files have no numbers?

Only one file may know the order, and that file is `script.md`. Numbered file names would force a rename on every reorder and destroy the diff. Reorder with `dek mv <slug> --before|--after <other>`.

## Does `sync` overwrite my HTML?

Never. It creates skeletons for missing slides and flags orphans. It does not rename either. Renaming is `dek mv`.

## What does an agent call?

The same CLI as a human: `dek help --agent`, `dek check <slug> --shot`, `dek lint --format sarif`. There is no MCP server. See [Working with AI Agents](./ai).

## Can I present without the dev server?

Yes. `dek build` produces one HTML file. Put it on a USB stick. Press `p` or open it with `?presenter`, and a second window follows the first through `BroadcastChannel`. Use `dek --remote` only when another device needs to drive the deck.

## Are Playwright, ffmpeg, and VOICEVOX required?

No. Each is optional, and only the commands that need it fail when it is missing, always with the install step in the hint. `--visual`, `shot`, `pdf`, and `video` use Playwright; `video` also uses ffmpeg; `voice`, `rehearse`, and `video` use a VOICEVOX-compatible engine. Engine setup is in [Voice and Video](./voice#setup).

## Where do I write pauses or silent time?

Nowhere. A beat with no paragraph passes through the transition and the configured `pause.beat`, and nothing else. If you will speak during a demo, write those words in the script so they count toward the estimate.
