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

For now dek.pub is open by invitation: you can make an account only with an address or a GitHub account dek.pub has invited, or with an address a deck has been shared with. An account you have keeps signing in.

The first time you sign in, dek.pub asks you to choose your handle before anything else: the name your profile and your talks go under, as `/@handle/<slug>`. It offers your GitHub login, or your address's part before the `@`, when no one has it. You choose it once and cannot change it later. On dek.pub's settings page, `/settings`, you set your name and up to five links for your profile: to GitHub, X, your site or anywhere else. An account made with GitHub starts with a link to its GitHub profile.

An agent cannot open a browser for you, so with `--json` the sign-in comes in two runs. The first returns at once:

```json
{ "ok": true, "action": "login", "status": "pending", "url": "https://dek.pub/device?user_code=WDJB-MJHT", "code": "WDJB-MJHT", "expiresAt": "…", "next": "dekc pub login --json", "server": "https://dek.pub" }
```

The agent shows you the URL and the code, then runs `next`, which waits until you approve and returns `"status": "signed-in"`. If that run is stopped, the next one waits for the same code until it expires.

In CI, set `DEK_TOKEN` to an API key instead; no sign-in is needed. dek sends it only to `https://dek.pub`, or to the server `DEK_TOKEN_SERVER` names.

Each `dekc pub login` makes a key of its own, named after the machine, that lasts a year. The CLI keys section of `/settings` lists your keys, with when each was made and last used, and revokes one, or all of them. If a key may have leaked, from CI above all, run `dekc pub logout --all` on any machine still signed in: it revokes every key of the account, the one in `DEK_TOKEN` included, and forgets the one kept here. Then sign in again with `dekc pub login` where you need to, and give CI a new key. An API key cannot list your keys, revoke another one alone, or change your settings; those take the browser.

## Publish a version

```bash
dekc pub publish -m "First run-through"
```

Publish does what you would do by hand before sharing a talk, and stops where you would:

1. It lints the deck as `dekc lint` does. An error stops it, with the diagnostics and exit 1, and nothing is sent; warnings go along with the version.
2. It builds the talk three times: with the whole script, for you; with what is said aloud, as `dekc build --public` does, for readers when the script is shown; and with no script at all, as `dekc build --no-script` does, for readers when it is not. dek.pub serves each reader the build they may read.
3. It takes a picture of each slide at its last beat, as `dekc shot` does, for the script article, and of the first for the link preview, when Playwright is installed.
4. It packs the deck's source, without `dist/` and `.cache/`, so `dekc pub status` can tell whether the current version is what you have.

The first publish makes the deck on dek.pub and writes its ID into `script.md`:

```yaml
---
title: How I Built an HTML Slide Tool
pub: d_k2m9x4q7w1
---
```

Commit that line, so a publish from any checkout updates the same deck. The deck's slug, the end of its URL, is the folder's name in lowercase; pass `--slug <slug>` on the first publish for another. A slug you already have is refused: a deck copied from another, or one whose `pub:` line was deleted, is made anew only with a `--slug` of its own.

Each publish is a new version, and readers see it at once. The version before it is deleted from dek.pub: your repository keeps every earlier state of the talk, and to go back you publish that source again. Sections renamed with `dekc mv` since the last version take their comments with them. A page still open on the old version is told to reload when someone comments from it.

## Share

A new deck is for its team alone: you and the team's side of the people you share it with. When it is ready for your guests, or for anyone, widen it with `dekc pub share`, which also sets the rest:

```bash
dekc pub share --visibility link --script shown --comments signed-in
```

| Flag | Values |
| --- | --- |
| `--visibility` | `team`: you and the team's side of those you share it with; `private`: you and everyone you share it with, team and guests; `link`: anyone with the link; `public`: everyone |
| `--script` | `shown`: readers see the script beside the slides, without its stage directions and comments; `hidden`: the slides alone |
| `--embed` | `on` lets other sites embed the deck |
| `--comments` | who may post comments at the bottom of a `link` or `public` talk: `off`, no one; `signed-in`, anyone signed in to dek.pub |
| `--new-link` | a new key in a `link` talk's URL; the URL given out before opens it no more |

A `link` talk's URL carries a key that cannot be guessed, as `/@you/talk?key=…`; `dekc pub share` and `dekc pub status` print it, and anyone without the key gets a page that does not exist. The people you share the deck with open it without the key. The key stays when the talk becomes `private` and back, and changes only with `--new-link`, or New link on its manage page.

Below a `link` or `public` talk, readers post comments on the talk as a whole, and like it, one like to an account; `--comments` says who may post, and only a reader signed in to dek.pub ever does. The review threads on the slides are for the people you share the deck with, whatever `--comments` says. You share a deck with people by handle or email address, each to view or to comment, and each on the team's side or the guests': on its manage page on dek.pub, or with `dekc pub grants add`. The team reads every thread; a guest reads only those shared with them, and never learns of the others. A guest opens the deck only once it is `private` or wider: to a guest, a `team` deck is a page that does not exist. A thread you or your team open is kept to the team unless you check Share with guests, and one kept to the team can be shared later, never taken back.

```bash
dekc pub grants add @sato --role comment --side team
dekc pub grants add client@example.com
dekc pub grants
dekc pub grants remove client@example.com
```

A new grant lets the person view, on the guests' side, unless `--role` and `--side` say otherwise; run `grants add` again to change one, and what you leave out stays as it was.

Each person you share a deck with is mailed a link to it. Someone invited by email address needs no GitHub account: on dek.pub's sign-in page they ask for a link by mail, sent only to an address a deck is shared with, that dek.pub has invited, or that has signed in before. Whoever is in a thread, as its author, by a reply, or as the deck's owner, is mailed of new replies and of its resolve, and you are mailed of new threads on your decks. The bell beside a talk's comments stops that mail for the talk. The talk page's Fullscreen button shows the deck with a header naming the talk and the page; its Review button, or `c`, opens the review beside the slide.

`dekc pub status` prints the settings, the version readers see, and whether it is the source as it is in your project. `dekc pub open` opens the deck in the browser.

## Answer the comments

```bash
dekc pub comments
```

Each comment says where it is: a passage of the script, with the line and column where `script.md` has it now, or an element of a slide, with the slide's file. An agent reads the same with `--json`, as it reads `dekc annotations`, and `shot` is the command that shows the slide the comment is on. A thread the deck's team keeps to itself is numbered on its own, with a T, as `T2`. Reply, and resolve a comment once it is dealt with, by its ID or its number:

```bash
dekc pub comments reply 3 "Reworded in the next version"
dekc pub comments resolve 3
```

`--status resolved` or `--status all` lists the others; `dekc pub comments reopen <id>` opens one again.

## Delete a talk

```bash
dekc pub delete --yes
```

Deleting a talk removes it from dek.pub for good: every version, the review threads and their replies, the comments and likes at the bottom, and who it is shared with. Nothing of it opens after that, its pictures and its build included, and it cannot be undone. Without `--yes`, `dekc pub delete` deletes nothing and says what it would. It then takes `pub:` out of `script.md`, to commit, so the next `dekc pub publish` makes a new deck at the same URL, with nothing of the old one. The talk's manage page on dek.pub has the same at its bottom, Delete talk, which asks you to type the talk's slug first.

Whoever runs a dek.pub can take down anyone's talk: `dekc pub takedown <talk> --yes`, with the talk's URL or its deck ID, from any directory. A dek.pub names the handles that may in its `DEK_PUB_OPERATORS` setting, and logs each takedown.

## Another server

Every subcommand takes `--server <url>`, and `DEK_PUB_SERVER` sets the same for a shell, as for a dek.pub running on your machine while it is developed. A key goes only over HTTPS, or plain HTTP to this machine, and each server has a key of its own. See the [CLI reference](/reference/cli#publish) for every flag and field.
