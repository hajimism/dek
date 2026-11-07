# 36. Ship dek-words, a check for a project's word list, as the second official plugin

Date: 2026-11-07

## Status

Accepted

## Context

An agent that writes a talk in Japanese leans on the same words: metaphor verbs (効く, 刺さる), role metaphors (入口, 土台), words that sound concrete and are not (解像度, 腹落ち), calques (〜した瞬間), and stiff forms (活用する, 〜を実施する). A team that cares writes them down. The project that asked for this keeps such a list in an agent skill and has the agent review a whole deck against it at the end. The review is slow, costs a pass of the model each time, and misses words the agent wrote again after it. A word on a list is a fact a check can find, so it belongs where the agent already stops: `dekc lint` ([Agent Usability Criteria](../docs/guide/agent-criteria.md), 2). [ADR 32](0032-let-a-plugin-the-user-installed-check-a-deck-and-pin-in-the-project-what-it-promised.md) named "a team can ban words" among the conventions a plugin is for.

textlint was the first idea, since it has Japanese rules and dictionaries already. It was measured on four Japanese decks before anything was built:

- `preset-ja-technical-writing` found 136 problems in one deck that a reviewer had already passed. 125 were rules that do not fit a talk: a period missing from slide copy, which leaves it out by design, and long sentences that were source lists. Two to four were worth changing.
- `preset-ai-words-ja`, a dictionary of words an AI tends to write, holds 19 of the 72 words in the project's list. The words it found most (道具, 検査, 部品) were ones the project's review had let stand.
- Reading slides with dek's knowledge of them (inline elements joined, ids taken out of headings) changed no count; it only put the columns right.
- The packages come to 286, 99 MB with the morphological dictionary, where dek depends on one.

What the project wants is its own list, matched where its words are. The content is the team's, and the matching is small. Verbs need their inflected forms, and that does not need morphological analysis: 効く found as 効か, 効き, 効く, 効け, 効こ, and 効い caught the project's own example, 「自チームの外まで効いている」, and did not touch 効果 or 影響. The false matches were compounds such as 突き抜ける, which an exception per word removes. The measurement also showed that a word on the list can be a term a talk is built on: one repository's series of talks used 物差し 180 times, as a word of its own argument.

## Decision

**dek ships a second official plugin, dek-words, inside its own package, as [ADR 34](0034-ship-dek-study-inside-dek-as-its-first-official-plugin.md) ships dek-study.** `[plugins.words]` in `dek.toml` and `dekc sync` turn it on. It has no page. It has no word list of its own: it checks the project's.

**The list is the project's, in `plugins/words/words.yaml`** ([ADR 35](0035-let-a-plugin-keep-data-for-the-whole-project-in-plugins-name.md)):

```yaml
version: 1
words:
  - word: 解像度
    use: 何がどこまで分かっているかを書く
  - word: 〜した瞬間
    pattern: た瞬間
    use: 「〜すると」「〜したとき」
  - word: 効く
    verb: godan
    use: 何が起きるかを書く
  - word: 突く
    verb: godan
    except:
      - 突き抜ける
  - word: 〇〇
    in: slides
```

- `word` is required, and is how a finding and an allow name the entry. Without `pattern` or `verb`, it is what is looked for.
- `pattern` is a regular expression, read with the `u` and `i` flags, looked for instead of `word`.
- `verb` is `godan` or `ichidan`, and looks for the verb's forms instead of `word` alone. A godan verb is found by its stem and each kana of its row, with the euphonic forms (効い, 待っ, 読ん): 効く is 効か, 効き, 効く, 効け, 効こ, or 効い. An ichidan verb is found by its stem, so 落ちる is 落ち; its stem is more than one letter, since 見 of 見る is in 意見 and 見解, and such a verb is written as a `pattern`. A verb with する is written by its noun, 活用, which finds 活用する too. `verb` and `pattern` do not go together.
- `except` lists longer words that hold the word and are not it. A place inside one of them is not a finding.
- `use` is what to write instead. It is the finding's hint.
- `in` is `slides` or `script`, to look in one of them alone.
- A word is matched with case ignored. A word that starts or ends with a Latin, Greek, or Cyrillic letter or a digit is matched only as whole words, as dek-study does, so `leverage` is not found in `leveraged` unless a `pattern` says so.

**A deck allows words it needs, in `words.yaml` in its folder:**

```yaml
version: 1
allow:
  - 物差し
```

An allow names an entry by its `word`, and the deck has no finding for it. There is no allow for one sentence or one place, as dek has none for its own rules.

**Where it looks.** In a slide, at the text a reader sees, as dek-study reads it: not inside `script`, `style`, `template`, or `noscript`, nor in comments or ruby's readings (`rt`, `rp`), with character references read as characters and each run of whitespace as one space. A line break of the source between two letters written without spaces, Han, kana, and their full-width punctuation, is no space, as CSS Text 3 has a browser show it: 解像 and 度 on two lines are 解像度, so wrapping a line does not hide a word. A `<br>` is a space. Text in separate block elements is never one match. In `script.md`, at headings without their `{#id}`, paragraphs and list items with the lines that continue them, read the same way, and tables; not at the frontmatter, code, HTML comments, or blockquotes, which are directions the audience never gets.

**Two rules:**

- **`WORDS001`, warning:** a word on the list is in the deck, at the place it starts: the slide's HTML or `script.md`, by line and column. The message names the entry, and the text found when it differs (`効く is on the word list, as "効い"`). The hint is the entry's `use`, or, without one, to write the sentence without it.
- **`WORDS002`, error:** the list or a deck's allows do not read. Either file is not YAML or its `version` is not 1. An entry lacks `word`, has a key the list does not know, a `verb` that is not `godan` or `ichidan` or does not end as that kind of verb ends, an ichidan verb whose stem is one letter, both `verb` and `pattern`, a `pattern` that is not a regular expression, or an `in` other than `slides` or `script`. Two entries share a `word`, or an allow names no entry. The finding is at the line in the file. What reads is still checked. The list is not there: a project that names the plugin fails lint until it writes one or takes the plugin out.

dek-words reads `script.md` from the deck's folder, which is its working directory, and the slides from the paths `CheckInput` gives. Its findings are sorted by path, line, column, and rule, so the same input gives the same output.

**What was not chosen:**

- **A bridge to textlint.** Its rules for technical writing do not fit a talk, its AI-words dictionary is a different list from the one a team keeps, and it would run code from the project's `node_modules`, which ADR 32 keeps out.
- **Morphological analysis.** It needs a 41 MB dictionary to catch the forms a godan or ichidan stem already catches. A verb it would still miss can be written as a `pattern`.
- **A list dek ships.** A general list found words this project chose to keep. dek would also be deciding the style of every team's talks.
- **A list in the user's home.** CI and a laptop would check the same commit differently (ADR 35).
- **An error for a word found.** Some words are right in some sentences, and an agent that cannot pass lint without rewriting a correct sentence learns to rewrite blindly. A team that wants a word gone checks its warnings before merging.
- **Nothing to check without a list.** A project that named the plugin and forgot its list would pass every deck, and an agent could not tell that pass from a clean deck ([Agent Usability Criteria](../docs/guide/agent-criteria.md), 6).
- **A rule of dek's own, `DEK047`.** Which words to avoid is a team's convention, the kind ADR 32 gives to plugins. As a plugin, it is opt-in, and a project that does not name it is unchanged.

## Consequences

- **A team's words are checked where the agent already stops.** The agent finds them in `dekc lint`, with the place and what to write instead. A review by the model is left with what a list cannot hold: what a title says, whether a claim keeps its source's certainty, whether a sentence means what it should.
- **The list is reviewed like code.** Adding a word, or allowing one in a deck, is a commit.
- **dek's package carries a few hundred more lines,** whether or not a project names the plugin, and the name `words` is taken, as `study` is.
- **Findings run only in `dekc lint`,** not in `dekc check` or the dev server, as for every plugin. An agent working one slide at a time sees them when it lints the deck.
- **The plugin copies dek-study's YAML reader** rather than sharing it, since an official plugin imports nothing but the published types and could move to a package of its own. The reader takes block lists only, so `except` and `allow` are written one item to a line.
- **A deck that uses a listed word many times** gets as many warnings, until the word is rewritten or allowed.
