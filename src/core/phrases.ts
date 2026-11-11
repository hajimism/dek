/**
 * Japanese broken by phrase where the browser does not do it itself. Chromium breaks a deck's
 * Japanese between phrases through `word-break: auto-phrase`; Safari and Firefox read that value
 * as one they do not know, drop it, and break between any two characters. For a deck in Japanese,
 * the build finds each run's phrases with BudouX and stamps them on the slide, and puts `keep-all`
 * before every `auto-phrase`, which those browsers fall back to. The page then puts a `<wbr>`
 * where each phrase starts, and only in a browser that does not support `auto-phrase`, so
 * Chromium draws a slide as it always did.
 */
import { decodeText } from "./attribute-value.ts";
import { phraseBoundaries } from "./budoux/parser.ts";
import { parseCss } from "./css.ts";
import { rewriteCss } from "./css-transform.ts";
import { type PhraseTable, READING_TAGS, RUN_TAGS, runKey, UNREAD_TAGS } from "./phrase-runs.ts";

/** Whether a deck in `lang` breaks by phrase in Chromium, which only Japanese does. */
export function breaksByPhrase(lang: string): boolean {
  return /^ja(?:-|$)/i.test(lang);
}

/**
 * The runs of a slide's text, as `phrase-runs.ts` defines them, each as its text nodes hold it:
 * character references decoded and white space as written.
 */
export function textRuns(html: string): string[] {
  const runs: string[] = [];
  let written = "";
  // Inside an element whose text is left out, and inside a ruby reading.
  let unread = 0;
  let reading = false;
  const end = () => {
    if (written !== "") {
      runs.push(decodeText(written));
    }
    written = "";
  };
  new HTMLRewriter()
    .on("*", {
      element(el) {
        if (unread > 0) {
          return;
        }
        const tag = el.tagName.toLowerCase();
        if (RUN_TAGS.has(tag)) {
          if (tag === "rb") {
            reading = false;
          }
          return;
        }
        if (READING_TAGS.has(tag)) {
          // A reading's end tag may be left out; the next base, reading, or block ends it too.
          reading = true;
          if (el.canHaveContent) {
            el.onEndTag(() => {
              reading = false;
            });
          }
          return;
        }
        end();
        reading = false;
        if (!el.canHaveContent) {
          return;
        }
        if (UNREAD_TAGS.has(tag)) {
          unread++;
          el.onEndTag(() => {
            unread--;
            end();
          });
        } else {
          el.onEndTag(() => {
            end();
            reading = false;
          });
        }
      },
    })
    .onDocument({
      text(chunk) {
        if (unread === 0 && !reading) {
          written += chunk.text;
        }
      },
    })
    .transform(html);
  end();
  return runs;
}

const JAPANESE = /[\p{scx=Hiragana}\p{scx=Katakana}\p{scx=Han}]/u;

/** Where each Japanese run of a slide breaks into phrases, for the page to break it there. */
export function phraseTable(html: string): PhraseTable {
  const table: PhraseTable = {};
  for (const run of textRuns(html)) {
    if (!JAPANESE.test(run)) {
      continue;
    }
    const boundaries = phraseBoundaries(run);
    if (boundaries.length > 0) {
      table[runKey(run)] = boundaries;
    }
  }
  return table;
}

/** `auto-phrase`, and what follows it in the value: an `!important`, if any. */
const AUTO_PHRASE_RE = /^auto-phrase(\s*!\s*important)?$/i;

/**
 * A deck's CSS with `keep-all` before each `word-break: auto-phrase`. Chromium reads the later
 * `auto-phrase` and breaks as before; a browser without it drops that one and keeps `keep-all`,
 * which breaks Japanese only at the page's `<wbr>`. A phrase too long for its line still breaks
 * there, as Chromium breaks one.
 */
export function phraseFallbackCss(css: string): string {
  const fallback = rewriteCss(parseCss(css), (sheet) =>
    sheet.decls.flatMap((decl) => {
      const match = decl.property.toLowerCase() === "word-break" && AUTO_PHRASE_RE.exec(decl.value);
      if (!match) {
        return [];
      }
      const important = match[1] ?? "";
      return [
        {
          start: decl.valueStart,
          end: decl.valueEnd,
          text: `keep-all${important}; word-break: auto-phrase${important}`,
        },
      ];
    }),
  );
  return `${fallback}
@supports not (word-break: auto-phrase) { .slide { overflow-wrap: break-word; } }`;
}
