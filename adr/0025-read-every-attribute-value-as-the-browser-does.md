# 25. Read every attribute value as the browser does

Date: 2026-10-27

## Status

Accepted

## Context

Lint and the build read a slide's markup with Bun's HTMLRewriter (lol-html), one parser for both, so a reference that passes lint never breaks the build. lol-html gives each attribute value as written: `getAttribute` returns `assets/Q&amp;A.png`, `&#106;avascript:x`, and `a&#32;b` with their character references left in, and nothing in dek decoded them. The browser decodes them before anything reads the value. So:

- `<img src="assets/Q&amp;A.png">`, correctly escaped, with `assets/Q&A.png` on disk, was `DEK021`, a missing image, in lint, and `dekc build` left the `src` as written: the single-file deck showed a broken image while the build reported `ok: true`.
- `DEK011` missed `&#106;avascript:alert(1)`, `java&#x09;script:alert(1)`, and `\x01javascript:alert(1)`, which it trimmed only of spaces; the URL parser reads all three as `javascript:`. `DEK011` is a convention, that script belongs in the slide's own `.ts`, not a security boundary, but a rule that reads a value other than the browser does misleads either way.
- A class written `a&#32;b`, a `srcset` with `&#44;` between its candidates, and a query string joined by `&amp;` were each read as something the page never sees.

Code that runs in the page through `page.evaluate` (`slide-draw.ts`, `slide-measure.ts`, `pptx-text.ts`, `pptx-paint.ts`, `text-contrast.ts`) and the in-deck runtime read the DOM, whose values the browser has decoded already. Only the rewriter's values are raw: those in `html-scan.ts`, `assets.ts`, and `html.ts`.

lol-html's `setAttribute` writes a value as it is given, escaping only `"`. A decoded value written back is decoded again by the browser: `class="a&amp;lt;"`, read as `a&lt;` and written back as it reads, becomes `a<`.

## Decision

**Every attribute value dek reads off HTMLRewriter is decoded as the HTML standard decodes an attribute value**, by one helper, `src/core/attribute-value.ts`: numeric references, with the standard's table for 0x80 to 0x9F and U+FFFD for NUL, a surrogate, or a number past Unicode; every named reference, including the legacy ones written without their `;`, which stay as written when a letter, a digit, or `=` follows them; a CR or CRLF read as LF, as the input stream reads it before the tokenizer; and a NUL read as U+FFFD, as the tokenizer reads it in a value. The helper also says where in the written value each decoded unit comes from, so lint locates a URL where it is written and the build replaces it there. A presence check, such as whether a slide names its own `data-slug`, reads nothing and needs no decoding.

**The named references are a generated table**, `src/core/html-entities.ts`, written by `bun scripts/html-entities.ts` from the list the standard publishes, `https://html.spec.whatwg.org/entities.json`, which its header names. It holds only what decoding needs: each name and its code points in hex, and the names also read without their `;`, in lines biome leaves as they are.

**A decoded value is split and trimmed only where HTML splits and trims it.** A reference can deliver a no-break space, or another space outside ASCII, which JavaScript's `\s` and `trim()` treat as whitespace and HTML does not. Classes and roles split on ASCII whitespace alone, and so do the URLs of a `srcset` from their descriptors; a URL is trimmed only of the C0 controls and spaces at its ends, which is what the URL parser strips; `aria-hidden` is trimmed of ASCII whitespace. An `aria-label` names its element unless it is empty or ASCII whitespace alone, as Chromium's accessible name keeps a label of no-break spaces and drops one of ASCII spaces; dek reads a `title` of ASCII whitespace alone as no name too. So `class="intro&nbsp;slide"` is one class and no slide, and `src="&nbsp;assets/a.png"` names a file that is not there, as the browser finds.

**A value written back is written from the value as written, never from the decoded one.** The build replaces only the span of each URL it inlines, with the data: URI escaped; an attribute with nothing to inline is not written at all, so it stays byte for byte. A class the player adds goes after the classes as written, once the decoded ones show it is not there; the slide's place goes ahead of its `style` as written. `data-dek-class`, by which annotate mode names an element, is the decoded classes, escaped: what the page's DOM then gives back is what `writtenElements` names the element by.

**`DEK011` reads a URL with the URL parser**, `URL.parse` against a page of its own: C0 controls and spaces trimmed, tabs and newlines dropped anywhere, and the scheme in any case, as the browser's own parser reads it. A `data:` URL is judged by its media type as before: HTML and XHTML always run script, and SVG where a frame or an object loads it as a document; an image's `data:` passes.

Every rule that quotes an attribute's value, in its message or its `data`, quotes the decoded value, which is the one it judged; the line and column are still where the attribute is written.

**What was not chosen:**

- **The `entities` package as a runtime dependency.** It decodes attributes correctly, but dek's only runtime dependency is zod. Each one is code that runs with the user's permissions, waits a week before an update installs ([ADR 19](0019-keep-dependency-code-away-from-the-tokens-that-publish.md)), and has to be trusted again at every bump. The table changes only when the standard adds a name, and the decoder is a hundred lines. `entities` is in `node_modules` today only through happy-dom and VitePress, so the generator reads the standard's own list rather than a package dek does not declare.
- **Decoding only numeric references.** `&amp;` is the reference markup writes most, and `Q&amp;A.png` is the defect that started this.
- **Decoding with the DOM in Chromium**, reading each value back from a page. Lint without `--visual` and the build start no browser, and every slide would make them start one.

## Consequences

A correctly escaped file name lints clean and is inlined into the build. A script URL written with references or a control character is `DEK011`, and a URL that only looks like one, such as `javascript:` after a no-break space, which the URL parser reads as a relative path, no longer is. Classes, roles, steps, morph names, layouts, and slugs are what the page reads, a no-break space in one included, and `dekc show` lists the files they name. The same whitespace rules now apply to a no-break space written as itself, which lint used to trim from a URL and split a class on. A diagnostic quotes a value that differs from the source only where the source writes a reference.

Tests check the decoder against a corpus and against Chromium itself: the corpus, every named reference with and without its `;`, and every numeric reference below 0x100, each read through HTMLRewriter and through the page. A wrong entry in the table fails them; a name the standard adds later does not, until the generator runs again, which needs the network, so no test checks that the committed table is current.
