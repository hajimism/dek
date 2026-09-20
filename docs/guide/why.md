# Why dek

Slides exist so that you can talk. Every mainstream tool forgets this. PowerPoint, Keynote, Google Slides, Marp, Slidev: all of them start with an empty box and ask you to fill it. You add a heading, then a diagram, then an animation. The deck grows more polished, and the talk grows harder to deliver. On the day, you watch the clock, skip three slides, and leave out the one thing you came to say.

dek starts from the other end. You write what you will say, in what order, and for how long. Only then do you ask what should be on screen at each moment. The script is the parent. Slides are derived from it.

## Three problems dek exists to solve

### A talk is not a one-off

Most slide tools treat a deck as a project. Every talk gets a fresh repository, a fresh theme, a fresh set of conventions, and everything you learned last time stays behind.

dek treats a **project** as a place that holds many **decks**. Conventions belong to the project. The look carries forward from your last deck. Each deck owns its script and slides. Your past talks are the starting point for the next one.

### Agents need small files

Fixing slide seven in a 3,000-line `slides.md` is an oddly hard task for a language model. The context is enormous, the diff is noisy, and one bad edit can break the whole deck.

In dek, one slide is one HTML file of roughly forty lines. The edit target is small, the diff is readable, and if something breaks it breaks one slide. This is the single biggest reason dek exists as a separate tool rather than a Slidev theme.

### Agents cannot see what they render

An agent that writes HTML has no idea whether the text fits in the box. The markup looks perfect as text. A human notices the overflow thirty minutes before going on stage.

dek renders the slide and reports what it sees as machine-readable diagnostics: overflow, contrast, missing images. The agent writes, checks, reads the result, and fixes its own mistake. The loop closes without a human in it.

## Three principles

Everything in dek follows from three rules. Each one is enforced by structure or by lint, not by documentation.

### 1. `script.md` is the single source of truth

Order, spoken words, and timing live in `script.md` and nowhere else. Slide HTML files belong to sections of that script. Because the relationship is structural, one side cannot drift from the other.

This is why slide files carry no sequence numbers. The only file that knows the order is the script. The same rule applies inside a slide: elements appear in the order of the script's beats, and HTML refers to those beats by id. A number in `data-step` is shorthand for "the k-th beat of this slide", nothing more.

### 2. A slide is one `<section class="slide">`

Every file in `slides/` has a single root: `<section class="slide">`. Appearance comes from `theme.css`; the document shell and the player come from the renderer. What you hand to an agent is a forty-line fragment, and that one file is all the context it needs.

The same property scales up to the deck directory. A deck never references anything outside itself. Its theme, its images, its voice settings all live inside. Copy the directory, zip it, open it five years later, and it renders the same way. The project is where decks live, not a runtime they depend on.

### 3. Conventions are enforced by lint

"Only use these CSS classes." "No raw values outside tokens." "Never reference a file outside the deck." Rules like these are not kept by writing them down. dek implements every one as a lint rule and reports them as SARIF.

**Passing lint is the definition of done.** The dev server lints on every save, so a deck you are working on is always either passing or telling you exactly why not. A deck without voice has the same definition of done as one with it. Voice adds diagnostics; it never changes what "finished" means.

Voice and video are derived from the script. The script itself knows nothing about how it looks or sounds.

## How dek compares

|  | PowerPoint / Keynote | Marp | Slidev | dek |
| --- | --- | --- | --- | --- |
| Authoring order | Slides first | Slides first | Slides first | Script first |
| Unit of work | One file, one deck | One file, one deck | One repo, one deck | One project, many decks |
| Slide source | Binary | Markdown | One `slides.md` | One HTML file per slide |
| Speaker script | Notes (child) | Weak | HTML comments (child) | `script.md` (parent) |
| Progressive reveal | Animations | Partial | `v-click` (slide owns order) | `###` beats (script owns order) |
| Timing | None | None | None | `duration` + word count + optional TTS length |
| Motion | Proprietary | CSS | Vue + custom DSL | CSS + View Transitions |
| Agent interface | Weak | Text | MCP server | CLI + `AGENTS.md` |
| Best for | General use | Simple Markdown decks | Technical talks with live demos | Talks where the speaking matters most |

Slidev is the most mature tool in this space, and dek borrows from it freely: presenter sync, optional Playwright, scoped CSS conventions. The decisive differences are file granularity, where the script sits in the hierarchy, and what counts as the unit of work.

dek carries no Vue, UnoCSS, Monaco, or Mermaid. That keeps lint and build simple, and it keeps plain HTML and CSS as a strength rather than a limitation.

## What dek is not for

Use Slidev if you need any of the following.

- Interactive slides: clickable demos, JavaScript inside a slide
- Live coding or an embedded editor
- A gallery of npm themes
- An animation DSL beyond what CSS provides
- PPTX or Keynote export, or a WYSIWYG editor

dek stays small enough for one person to maintain, and it stays focused on talks where the speaking is the point. See the [FAQ](./faq) for the edge cases.

## Next

[Getting Started](./getting-started) takes you from install to a deck you can present with the bundled theme, without writing any HTML.
