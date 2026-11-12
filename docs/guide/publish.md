---
description: 'Put a talk on dek.pub with dekc pub: sign in, publish a version, choose who reads the script and who comments, and answer the comments from the terminal.'
---

# Publish on dek.pub

[dek.pub](https://dek.pub) shows a talk online: the slides, the script beside them for those you share it with, and comments on a slide or a passage of the script. `dekc pub` puts a deck there from the project, the way `dekc build` writes it to a file, and brings the comments back to the files they are about.

## Sign in

```bash
dekc pub login
```

dek prints a URL and a code on stderr. Open the URL, sign in to dek.pub, and approve the code; dek waits for that, then keeps the API key dek.pub gives it, in the OS keychain, or in `~/.config/dek/credentials.json`, readable only by you, where there is no keychain. `dekc pub whoami` says who you are signed in as, and `dekc pub logout` revokes the key and forgets it.

An agent cannot open a browser for you, so with `--json` the sign-in comes in two runs. The first returns at once:

```json
{ "ok": true, "action": "login", "status": "pending", "url": "https://dek.pub/device?user_code=WDJB-MJHT", "code": "WDJB-MJHT", "expiresAt": "…", "next": "dekc pub login --json", "server": "https://dek.pub" }
```

The agent shows you the URL and the code, then runs `next`, which waits until you approve and returns `"status": "signed-in"`. If that run is stopped, the next one waits for the same code until it expires.

In CI, set `DEK_TOKEN` to an API key instead; no sign-in is needed.

## Publish a version

```bash
dekc pub publish -m "First run-through"
```

Publish does what you would do by hand before sharing a talk, and stops where you would:

1. It lints the deck as `dekc lint` does. An error stops it, with the diagnostics and exit 1, and nothing is sent; warnings go along with the version.
2. It builds the talk three times: with the whole script, for you; with what is said aloud, as `dekc build --public` does, for readers when the script is shown; and with no script at all, as `dekc build --no-script` does, for readers when it is not. dek.pub serves each reader the build they may read.
3. It takes a picture of each slide as it arrives, and of the first at its last beat for the link preview, when Playwright is installed.
4. It packs the deck's source, without `dist/` and `.cache/`, so `dekc pub status` can tell whether the newest version is what you have.

The first publish makes the deck on dek.pub and writes its ID into `script.md`:

```yaml
---
title: How I Built an HTML Slide Tool
pub: d_k2m9x4q7w1
---
```

Commit that line, so a publish from any checkout updates the same deck. Delete it to publish as a new deck.

Each publish is a new version. It becomes the one readers see unless you pass `--no-promote`. Sections renamed with `dekc mv` since the last version take their comments with them.

## Share

A new deck is private. Choose who may open it, and the rest, with `dekc pub share`:

```bash
dekc pub share --visibility link --script shown --comments signed-in
```

| Flag | Values |
| --- | --- |
| `--visibility` | `private`: you and those you share it with; `link`: anyone with the link; `public`: everyone |
| `--script` | `shown`: readers see the script beside the slides, without its stage directions and comments; `hidden`: the slides alone |
| `--embed` | `on` lets other sites embed the deck |
| `--comments` | `off`, `signed-in`, or `guests` |

`dekc pub status` prints the settings, the versions, and whether the newest is the source as it is in your project. `dekc pub open` opens the deck in the browser.

## Answer the comments

```bash
dekc pub comments
```

Each comment says where it is: a passage of the script, with the line and column where `script.md` has it now, or an element of a slide, with the slide's file. An agent reads the same with `--json`, as it reads `dekc annotations`, and `shot` is the command that shows the slide the comment is on. Reply, and resolve a comment once it is dealt with, by its ID or its number:

```bash
dekc pub comments reply 3 "Reworded in the next version"
dekc pub comments resolve 3
```

`--status resolved` or `--status all` lists the others; `dekc pub comments reopen <id>` opens one again.

## Another server

Every subcommand takes `--server <url>`, and `DEK_PUB_SERVER` sets the same for a shell, as for a dek.pub running on your machine while it is developed. A key goes only over HTTPS, or plain HTTP to this machine, and each server has a key of its own. See the [CLI reference](/reference/cli#publish) for every flag and field.
