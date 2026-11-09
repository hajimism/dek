/// <reference lib="dom" />

import {
  PHRASES_ATTRIBUTE,
  type PhraseTable,
  READING_TAGS,
  RUN_TAGS,
  runKey,
  UNREAD_TAGS,
} from "../core/phrase-runs.ts";

/** Whether the browser breaks Japanese by phrase itself, as Chromium does. */
function supportsAutoPhrase(): boolean {
  return globalThis.CSS?.supports?.("word-break", "auto-phrase") ?? false;
}

/**
 * Puts a `<wbr>` where each phrase starts in every slide under `root`, or in `root` when it is
 * one, by the table the build stamped on it, and only in a browser that does not break by phrase
 * itself. A slide is broken once: its table is taken off it.
 */
export function breakPhrases(
  root: ParentNode,
  supported: () => boolean = supportsAutoPhrase,
): void {
  const selector = `[${PHRASES_ATTRIBUTE}]`;
  const slides = [
    ...(root instanceof Element && root.matches(selector) ? [root] : []),
    ...root.querySelectorAll(selector),
  ];
  if (slides.length === 0 || supported()) {
    return;
  }
  for (const slide of slides) {
    const table = readTable(slide.getAttribute(PHRASES_ATTRIBUTE) ?? "");
    slide.removeAttribute(PHRASES_ATTRIBUTE);
    if (!table) {
      continue;
    }
    for (const run of textRuns(slide)) {
      const text = run.map((node) => node.data).join("");
      const boundaries = table[runKey(text)];
      if (boundaries) {
        insertBreaks(run, text.length, boundaries);
      }
    }
  }
}

function readTable(value: string): PhraseTable | undefined {
  try {
    const table: unknown = JSON.parse(value);
    return table && typeof table === "object" ? (table as PhraseTable) : undefined;
  } catch {
    return undefined;
  }
}

/** The runs of a slide's text, each as the text nodes it is in, as `phrase-runs.ts` defines them. */
function textRuns(slide: Element): Text[][] {
  const runs: Text[][] = [];
  let run: Text[] = [];
  const end = () => {
    if (run.length > 0) {
      runs.push(run);
    }
    run = [];
  };
  const walk = (parent: Node) => {
    for (const child of parent.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        run.push(child as Text);
        continue;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) {
        continue;
      }
      const tag = (child as Element).localName;
      if (READING_TAGS.has(tag)) {
        continue;
      }
      if (RUN_TAGS.has(tag)) {
        walk(child);
        continue;
      }
      end();
      if (!UNREAD_TAGS.has(tag)) {
        walk(child);
        end();
      }
    }
  };
  walk(slide);
  end();
  return runs;
}

/**
 * A `<wbr>` at each of `boundaries`, offsets into the run's text. One at the end of a text node
 * goes there, inside the inline element that holds it, which draws the same as just after it.
 */
function insertBreaks(run: Text[], length: number, boundaries: number[]): void {
  // From the last, so a split leaves the offsets before it where they were.
  const sorted = boundaries.filter((at) => at > 0 && at < length).sort((a, b) => b - a);
  let nodeIndex = run.length - 1;
  let nodeStart = length - (run[nodeIndex]?.data.length ?? 0);
  for (const at of sorted) {
    while (nodeIndex > 0 && at <= nodeStart) {
      nodeIndex--;
      nodeStart -= run[nodeIndex]?.data.length ?? 0;
    }
    const node = run[nodeIndex];
    if (!node) {
      return;
    }
    const wbr = node.ownerDocument.createElement("wbr");
    const offset = at - nodeStart;
    if (offset >= node.data.length) {
      node.after(wbr);
    } else {
      node.splitText(offset).before(wbr);
    }
  }
}
