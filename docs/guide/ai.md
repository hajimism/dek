# Working with AI Agents

Agents use the same CLI you do. There is no MCP server and no tool schema to install. A coding agent already has a shell and a file editor; a slide is a forty-line HTML file, so the agent's own editor is the most precise and cheapest way to change it. dek adds only what an agent cannot do well on its own: seeing how the slide renders, hearing how it reads, and the fragile operations of renaming and reordering.

## What the agent reads

`dek init` writes a short `AGENTS.md` at the project root, and `dek new`, `dek ref`, and `dek sync` keep it current: the three principles, the conventions, the class names, tokens, and layouts from the project theme, and a pointer to the CLI's own reference. It stays under a hundred lines. Anything more detailed is pulled from the CLI when needed.

dek owns only the block between `<!-- dek:begin … -->` and `<!-- dek:end -->`, and rewrites it in place. Write your team's own notes for agents above or below it; they stay. An `AGENTS.md` you already had keeps its text and gets dek's block appended.

```bash
dek help --agent
```

That is enough for Claude Code, Codex, OpenCode, or any other agent to work in a dek project with no extra configuration.

## What the CLI promises

1. **Every result command accepts `--json`, and every result has one shape.** An agent branches on `ok`, reads `error` when it is `false`, and works through `diagnostics`. `dek` and `dek rehearse` stay running and are the only exceptions. Nothing forces an agent to parse prose; the contract is [below](#the-json-contract).
2. **Every error names the next command.** "`slides/intro.html` is missing; run `dek sync`." The hint is something you can run as-is. Diagnostics carry a hint too when the fix is known, such as `use hook, turn, or 1-2` for a `data-step` that names no beat.
3. **`dek help --agent` is a few hundred tokens.** The CLI documents itself.
4. **`AGENTS.md` stays short.**

## The JSON contract

Success is `{ "ok": true, ... }` with exit code 0. Failure is `{ "ok": false, "error": { ... }, ... }` with exit code 1, whether the command could not run or lint and check found an error:

```json
{ "ok": false, "error": { "message": "deck \"nope\" not found", "path": "decks/nope", "hint": "run `dek ls`" } }
```

```json
{
  "ok": false,
  "error": { "message": "lint found 1 error", "hint": "fix each error in diagnostics, then run `dek lint` again" },
  "diagnostics": [
    {
      "id": "DEK011",
      "severity": "error",
      "message": "slide contains an onclick attribute",
      "path": "slides/intro.html",
      "line": 6,
      "column": 11,
      "slug": "intro",
      "hint": "remove it; a slide takes no input, and motion goes in slides/intro.ts as a draw(t) function",
      "data": { "kind": "attribute", "name": "onclick", "value": "go()" }
    }
  ]
}
```

- `error` always has a `message`, a `hint` whenever dek knows the next step, and `path` and `line` when the failure has a place.
- Commands that report diagnostics (`lint`, `check`, `build`, `ls`, `cues`) always carry a `diagnostics` array, pass or fail. Each diagnostic has its `severity`, a `path`, `line`, and `column` when it has a place, a `hint` when the fix is known, and the values its message names as `data`. Only errors fail; warnings alone are `"ok": true`.
- A check that did not run is an entry in `skipped`, never an empty pass: `{ "check": "rumdl", "reason": "rumdl is not installed", "hint": "bun add -d rumdl; …" }`. The field is absent when everything ran.
- A command that writes files for every deck in scope returns a list, one deck or many: `build` and `pdf` return `outs`.
- `dek lint --format sarif` returns the same diagnostics as SARIF 2.1.0.

While dek is 0.x, the `--json` shape and the rule ids may still change between releases. A rule id is never reused: a retired id stays retired.

## One round trip

```bash
dek check architecture --shot
dek check architecture --voice
```

`check` lints one slide, including the rendering rules when Playwright is available, writes a screenshot, and returns the diagnostics and the image path. The path contains a hash of the rendered content, so an agent that opens the returned path never sees a stale image. `--voice` returns the kana reading and duration for each sentence. Write the HTML, run `check`, look at the picture, read the pronunciation, fix. Write, see, hear, fix: one loop, closed.

Without Playwright, `check` still lints and lists `visual` in `skipped` with the reason and a hint that installs it, so an agent never mistakes a skipped measurement for a pass. `--voice` on a deck without `voice/` does the same: `voice` is skipped with the reason and how to set it up, and the rest of the check still runs.

Anything geometry can decide is a lint rule. Overflow and contrast have definite answers once a browser measures them, and a measured verdict is more reliable than showing an agent a screenshot and asking whether the text fits.

## Pointing goes both ways

```bash
dek goto architecture
dek current
```

After editing a slide, the agent can jump the human's browser to it. When the human says "make the figure on this slide smaller", the agent runs `dek current`, learns the slug, and fixes it without asking which slide.

## Using a slide as a model

```bash
dek show why-dek timing
```

`show` returns everything one slide is made of in one call, each part labeled with its file: the section's script, the slide's HTML, CSS, and TS, the rules of `theme.css` the slide actually uses with only the tokens and keyframes they reach, and the assets it references. An agent learns how the slide is built without reading the whole theme, then writes its own slide in its own deck's theme. Lint catches any class or token it carried over by mistake.

The model can be someone else's deck. `dek ref owner/repo/deck` pins it, and `ls`, `show`, `theme`, and `shot` then take `owner/repo/deck` as the deck. AGENTS.md lists the pinned refs, so the agent knows which decks it may learn from. A ref is read-only; the agent copies what it needs into its own deck.

## Prompts that work

```
Shrink the right column of architecture.html, then run
dek check architecture --shot and confirm nothing overflows.
```

```
On the slide from dek current, reveal the elements beat by beat with
data-step, following the script's ### headings.
```

```
I added ## recap {#recap} to script.md. Do not run dek sync;
the dev server will generate the skeleton. Fill it in.
```

```
Carry the figure from problem into architecture with data-morph.
Run dek shot problem --to architecture --at 0.5 and check the
interpolated position looks right.
```

```
Make the number on files count up as the slide enters. Put it in
slides/files.ts, drawing from t alone, then run dek check files --shot.
```

```
Use hajimism/dek/why-dek as a model. Find the slide closest to what
the budget section needs with dek ls, read it with dek show, and write
budget in this deck's theme.
```

```
Make a slide like timing in why-dek for this deck's budget section.
Read it with dek show why-dek timing, write it with this deck's
theme, then run dek check budget --shot.
```

To hand the whole documentation site to an agent, give it [`/llms.txt`](/llms.txt).
