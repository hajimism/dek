# 15. Hand a deck over as a pack and read it as a ref

Date: 2026-10-21

## Status

Accepted

## Context

A ref is someone else's deck, pinned in `dek.toml` `[refs]` to read as a model: `ls`, `show`, `theme`, and `shot` read it, every other command refuses it, and AGENTS.md lists it as a deck the agent may learn from but not edit. Until now the only source of a ref was GitHub: `dekc ref owner/repo/deck` resolves a rev to a commit, downloads the repository's tarball, and keeps one deck of it under `refs/`. The pin in `dek.toml` is the ref; the snapshot is a copy that the next read fetches again, so `refs/` is gitignored.

That leaves out every deck the reader cannot reach on GitHub: one in another organization's private repository, one whose author keeps it in no repository at all, one that came over chat or a shared drive. Private repositories of the reader's own organization already work with `GITHUB_TOKEN` ([ADR 12](0012-take-github-tokens-and-dek-variables-only-from-what-the-user-sets.md)); the rest needs someone to grant access first, which is what the people handing a deck over want to skip.

A deck is self-contained, so it can already be handed over by hand: zip `decks/<name>/`, send it, unzip it into the reader's own `decks/`. Every command then reads it, but as the reader's own deck. The agent may edit it, `dekc lint` and `dekc build` take it in, and AGENTS.md does not mark it as a model, so the lint rule that catches a class or token carried over from a model has nothing to tell apart. Keeping the reader's decks and the decks they learn from apart is what the agent loop relies on.

Three facts bound the format:

- Bun's `Bun.Archive` reads and writes tar and gzipped tar, and nothing else. dek writes zip for `dekc pptx`, but has nothing that reads one.
- `Bun.Archive` writes the current time into each entry, whatever time the file it is given carries, so the same files packed twice are different bytes.
- git cannot track a file inside a folder it ignores, and every project that has a ref ignores `refs/` whole.

## Decision

**`dekc pack [deck] [--root-dist]` writes `dist/<deck>.tgz`, one file per deck, as `dekc pdf` does.** The file is a gzipped tar of a project holding that one deck, under a top folder named for it, so that unpacking it by hand lands in one folder:

```text
<deck>/
├── dek.toml            # empty: the sender's [refs] and [voice] stay home
├── LICENSE             # what [pack] license names, else the project's own
└── decks/<deck>/
    ├── script.md
    ├── theme.css
    ├── slides/
    └── assets/
```

The deck keeps what reading it needs, the same files `dekc ref` keeps from a repository: not `dist/`, `.cache/`, or `voice/`. A file or folder whose name starts with a dot stays behind. `--json` returns `outs`.

Pack refuses, before it writes anything, what the reader could not take: a deck whose name holds a space or `@`, since a ref name cannot carry it; a deck whose files come to more than 50 MB, the most `dekc ref` keeps of any ref; a symlink dek does not follow anywhere else, one that leads out of the project, into a hidden folder, or to a file of another kind. A deck need not pass lint to be packed: the reader reads it, they do not build it. A ref cannot be packed; it is not the reader's to hand on.

**A pack says what its reader may do with it, and a new project hands its decks over under CC0 1.0.** A deck handed over to be read as a ref is used as a template: the reader takes its layouts, its theme, and its way of writing into decks of their own, which they then present to other people. The license that suits that is the one that carries nothing into those decks. CC BY 4.0 would have every deck built on the template credit it; MIT would have its notice travel with every copy of `theme.css`; CC0 1.0 asks for neither. So `dek.toml` takes `[pack] license`, `"CC0-1.0"` or `"CC-BY-4.0"`, for an author who wants credit, and `dekc init` writes `"CC0-1.0"` into every new project, under a comment that says what it grants and that deleting the line hands decks over with no license:

```toml
[pack]
# The license `dekc pack` hands a deck over under. CC0-1.0 lets the reader reuse it
# freely, with no credit owed, as a template is meant to be used; CC-BY-4.0 asks for
# credit. Delete the line to hand decks over with no license.
license = "CC0-1.0"
```

The pack carries the license's legal code as `LICENSE`, as Creative Commons publishes it; dek ships the two texts in `src/core/licenses/`, which Creative Commons dedicates to the public domain under CC0. `[pack] license` comes before the project's own LICENSE file, since it is the license for this act of handing over; without it, the pack carries that file, and with neither it carries none. Then `dekc pack` warns the sender, who can fix it, rather than leaving the warning to the reader, who cannot: `warnings` in `--json`. Any other value is refused when `dek.toml` is read, with the two ids and the LICENSE file as the hint. Nothing but `dekc pack` reads the key: a ref on GitHub reads the repository's LICENSE file, so a default written by `init` never speaks for a repository pushed in public.

**`dekc ref <file>.tgz` pins the pack as `file/<deck>`.** An argument that ends in `.tgz` or `.tar.gz` is a path, read from the working directory; anything else is a ref name or a GitHub link as before. The pack must hold exactly one deck beside a `dek.toml`, as `dekc pack` writes it; a tarball of a whole project with more than one deck is refused, with `dekc pack <deck>` as the hint. Its deck name is the ref's: `file/2026-10-talk`.

`ls`, `show`, `theme`, and `shot` read `file/<deck>` as they read `owner/repo/deck`, and every other command refuses it as a ref. A ref name with two segments is a pack's when the first is `file`; one with three is GitHub's. Neither is ever a deck name, which cannot hold a `/`. So that `refs/file/<deck>` and a GitHub ref's `refs/<owner>/<repo>/<deck>` never overlap, `file` is reserved: `dekc ref file/<repo>/<deck>` is refused as a GitHub owner.

**The pin is a digest of what the snapshot keeps, and the pack itself is committed.** `[refs]` keeps its shape, a name and a string:

```toml
[refs]
"hajimism/dek/why-dek" = "<40-character commit sha>"
"file/2026-10-talk" = "<64-character sha256>"
```

The sha256 covers every file the snapshot keeps, `.ref.json` aside, in byte order of their paths, each as its path, a NUL, its size in bytes as decimal digits, a NUL, and its bytes. Packing a deck that has not changed pins the same digest, however the tarball's bytes came out, and so does a tarball of the same files made by hand.

`dekc ref` copies the pack into the project as `packs/<deck>.tgz`, named for its deck rather than for the file it was given, so that a browser's `2026-10-talk (1).tgz` updates the ref instead of starting another. It unpacks the snapshot into `refs/file/<deck>`, gitignored like any other. `packs/` is not ignored, and the text output says to commit the pack: that is what lets a clone, or a `refs/` that was deleted, unpack the ref again on its next read. A pack that is missing stops that read with its path, and with the hint to commit `packs/` and to add the ref again from the pack that was sent; one whose files no longer match the pin stops it with `dekc ref packs/<deck>.tgz` as the hint, which pins the pack that is there. Neither writes a snapshot. `--json` adds `pack`, the path of the committed file. `dekc ref rm file/<deck>` drops the pin, the snapshot, and the pack, and `packs/` once it is empty.

Running `dekc ref` on a newer pack of the same deck moves the pin, and `from` and `changed` say so, as for a GitHub ref. Running it on the same deck unchanged changes nothing. A pack with no license file is read with the same warning as a repository with none.

**A pack is read with limits.** The file may be 50 MB at most. It is gunzipped through a stream that stops at 100 MB, before any of it is taken apart, so a small file that inflates without end is refused instead of filling memory. The tar is then read as a GitHub tarball is: its top folder dropped, any path that is absolute, has an empty segment, or climbs with `..` left out, and links left out.

**What was not chosen:**

- **Zip.** It is what a file manager makes, but dek would need a zip reader, a new parser for files from other people. The sender runs `dekc pack`, so the format is dek's to choose. Taking a zip made by hand is a later decision, with that cost.
- **The built HTML.** `dekc build` writes a single file a person can open, but it is the deck compiled, not its sources, and reading it back would tie the build's output to the ref reader.
- **A sha256 of the pack file.** The same deck packs to different bytes, so the pin would move on every pack. A tar writer of dek's own that leaves the time out would also have to split long paths for ustar.
- **A table in `[refs]`** holding the pack's path and digest. The path follows from the name.
- **The snapshot committed under `refs/`.** `refs/` is ignored whole and is a copy by definition; a committed pack keeps both true.
- **A top-level `license` in `dek.toml`.** It reads as the repository's license, which GitHub refs never consult, so a default `init` wrote would look like a grant made in public. `[pack]` names the one thing it does.
- **CC BY 4.0 or MIT as the default.** Each puts a condition into every deck built on the template: credit on its slides, or a notice beside its theme. CC BY 4.0 stays one line away for an author who wants credit.
- **A name from the file, or a prefix like `local/`.** A file's name changes in transit; a prefix GitHub could hand to a user would put its refs in the same folders.

## Consequences

Anyone who can send a file can hand over a deck to learn from, and the reader's agent reads it as it reads a deck on GitHub: read-only, out of their lint and build, listed in AGENTS.md as a model.

The reader's repository holds a copy of someone else's deck. Who may read it is now whoever may read that repository, which is what the people handing it over asked for, and what the reader has to keep in mind before pushing it anywhere public.

A deck packed in a project `dekc init` made goes out under CC0 1.0, so its author gives up every right in it, credit included, toward anyone who receives the pack; the comment in `dek.toml` is what tells them so, and they may change it before they pack. Projects made before this, and `sample/`, have no `[pack]` and pack with their own LICENSE file or none, with the warning. A pack with no license is read with the warning a repository with none gets.

Two senders whose decks share a name share a ref: the second pack replaces the first, and `from` says that the pin moved. Telling them apart, with a name the reader chooses, is left until it is needed.

A GitHub account named `file` cannot be pinned as a ref.

`[refs]` takes a 64-character sha256 for a `file/` name and a 40-character commit sha for any other, and refuses each where the other belongs.

The official skill does not name `dekc pack` until its floor reaches the release that adds it ([ADR 9](0009-generate-llms-txt-from-its-sources-and-ship-one-skill-that-defers-to-the-installed-dek.md)).
