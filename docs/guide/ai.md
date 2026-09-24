# Working with AI Agents

Agents use the same CLI you do. There is no MCP server and no tool schema to install. A coding agent already has a shell and a file editor; a slide is a forty-line HTML file, so the agent's own editor is the most precise and cheapest way to change it. dek adds only what an agent cannot do well on its own: seeing how the slide renders, hearing how it reads, and the fragile operations of renaming and reordering.

## What the agent reads

`dek sync` writes a short `AGENTS.md` at the project root and keeps it current: the three principles, the conventions, the class names, tokens, and layouts from the project theme, and a pointer to the CLI's own reference. It stays under a hundred lines. Anything more detailed is pulled from the CLI when needed.

```bash
dek help --agent
```

That is enough for Claude Code, Codex, OpenCode, or any other agent to work in a dek project with no extra configuration.

## What the CLI promises

1. **Every result command accepts `--json`.** Success is `{ "ok": true, ... }`; failure is `{ "ok": false, "error": { "message", "path", "hint" } }` with exit code 1. `dek` and `dek rehearse` stay running and are the only exceptions. Diagnostics are SARIF. Nothing forces an agent to parse prose.
2. **Every error names the next command.** "`slides/intro.html` is missing; run `dek sync`." The hint is something you can run as-is.
3. **`dek help --agent` is a few hundred tokens.** The CLI documents itself.
4. **`AGENTS.md` stays short.**

## One round trip

```bash
dek check architecture --shot
dek check architecture --voice
```

`check` lints one slide, including the rendering rules when Playwright is available, writes a screenshot, and returns the diagnostics and the image path. The path contains a hash of the rendered content, so an agent that opens the returned path never sees a stale image. `--voice` returns the kana reading and duration for each sentence. Write the HTML, run `check`, look at the picture, read the pronunciation, fix. Write, see, hear, fix: one loop, closed.

Anything geometry can decide is a lint rule. Overflow and contrast have definite answers once a browser measures them, and a measured verdict is more reliable than showing an agent a screenshot and asking whether the text fits.

## Pointing goes both ways

```bash
dek goto architecture
dek current
```

After editing a slide, the agent can jump the human's browser to it. When the human says "make the figure on this slide smaller", the agent runs `dek current`, learns the slug, and fixes it without asking which slide.

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

To hand the whole documentation site to an agent, give it [`/llms.txt`](/llms.txt).
