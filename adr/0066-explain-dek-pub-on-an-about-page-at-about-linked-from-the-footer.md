# 66. Explain dek.pub on an About page at /about, linked from the footer

Date: 2026-11-14

## Status

Accepted

## Context

dek.pub's landing page shows what a talk looks like there: the deck, the script as an article, and comments that come back as data. It does not say why dek.pub exists, how much of an author's script reaches readers, or what dek.pub will not do with a talk. Those answers are spread over the docs' publish guide, the manage page's hints and the sign-in page's note.

A reader who arrives on a talk asks whether they need an account. An author asks who will see a deck they publish, and whether the stage directions in their script reach anyone. Someone asked to review asks what they can see.

The About pages of services that keep their users' trust (Zenn, Are.na, Linear, Substack, しずかなインターネット) answer these the same way. They speak in one voice, in one reading column. They show the real product, not icons. They say what the service is not, and why each rule is there. None of them sets its answers as rows of icon cards or checkmark lists.

## Decision

**dek.pub has an About page at `/about`**, in both languages, indexed like the landing page. Its body is `src/shell/ui/about.svelte`, beside the 404 page, so a browser test renders it; `pages/about.svelte` places it, and `pages/about.server.ts` loads the landing page's sample talk (`FEATURED_TALK`) and hands it over as a plain `{ href, title, handle, picture }`, since the shell does not know the deck model. The footer links to the page first, as "About" and 「dek.pub について」.

**It is set as a talk's article is:** one reading column, on the left edge the header and the landing page share. Every block, the figures and the table included, is the column's width, so the page has one left edge and one right edge, and Japanese paragraphs are justified to both. It has no cards, no icons and no checkmark lists.

**It says, in this order:**

1. **What dek.pub is**, then the sample talk's cover, title and author, linked, when there is one.
2. **Why it exists.** Slides alone do not keep a talk, and a recording is hard to sit through. dek writes the script first, so the words are already text, and dek.pub publishes them with the slides.
3. **How much of the script reaches readers**, shown rather than told: a few lines of `script.md` with a `>` stage direction struck through, beside the same section as the article shows it, without the direction. Under it, the plain fact: the full build and the source, stage directions included, are uploaded as well, and are never handed to readers.
4. **Who sees a talk**, as a table of the three visibilities, by who can open it, whether it is on the profile and in RSS, and whether search engines index it. On a phone each visibility stacks, with each answer under its column's name. Then: the script and comments are chosen talk by talk, and a talk someone may not see is to them a page that does not exist.
5. **What each person can do**, addressed to them in prose: someone who came to read, someone who gives talks, someone asked to review.
6. **What dek.pub won't do**, each a claim and its reason: it won't flatten slides into images, publish behind the author's back, rank talks, or keep a talk from its author.
7. **How to start**, as one terminal block of three commands, and **where to read more**, as plain links to the docs in the reader's language and to the repository.

It ends with one sentence and one button: sign in, or go to your talks.

**It says only what dek.pub does today.** Nothing on it names a price, a plan, a limit, the people who make it, terms or a privacy policy, and nothing promises what dek.pub lists as not done yet.

**What was not chosen:**

- **Putting all of it on the landing page.** The landing page shows a talk and the newest talks; the reasons and the rules would push those down for someone who came to read.
- **A page in the docs.** The docs are for dek's users at their terminal; a reader who reached dek.pub from a talk should not leave the site to learn what it is.
- **Cards for each kind of person and each visibility.** They read as a template and say less than a sentence or a table row does.
- **Saying stage directions never leave the author's machine.** `dekc pub publish` uploads the full build and the source; what is true is that readers never get them.
- **Naming the maker and stating that pricing is undecided.** Both are the maintainer's to put on a public page, and they chose not to now.
- **The body written as Markdown or HTML in the strings.** Every string in `i18n.ts` renders as text, and the page keeps that: one key for each paragraph, cell or line.

## Consequences

- `tests/browser/about.test.ts` checks the page's heading and sample, the stage direction in `script.md` and gone from the article, the table's answers, the three people it speaks to, the commands, the docs links in Japanese, and the call to action for a visitor and for someone signed in. The e2e run checks that `/about` answers 200 to anyone.
- A change to what dek.pub does, its visibilities, what `dekc pub publish` uploads, its sign-in or its licenses changes the About page in the same pull request.
- If pricing, terms, a privacy policy or the people behind dek.pub are to be stated, the page and the footer gain them, with an ADR of their own.
