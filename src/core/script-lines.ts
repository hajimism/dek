import { splitLines } from "./lines.ts";

/** One line of a script's body, and whether it is literal text no heading can start. */
export type ScriptLine = { text: string; literal: boolean };

const FENCE_OPEN_RE = /^ {0,3}(`{3,}|~{3,})(.*)$/;

/**
 * The body's lines, each marked literal when it is part of a fenced code block, fences included,
 * or lies inside an HTML comment. A `##` there is text the slide shows or the author hid, never a
 * slide or a beat. Fences follow CommonMark: three or more backticks or tildes, indented at most
 * three spaces, closed by a run of the same character at least as long.
 */
export function scriptLines(body: string): ScriptLine[] {
  let fence: { char: string; length: number } | undefined;
  let comment = false;
  return splitLines(body).map((text) => {
    if (fence) {
      const close = new RegExp(`^ {0,3}${fence.char === "`" ? "`" : "~"}{${fence.length},}\\s*$`);
      if (close.test(text)) {
        fence = undefined;
      }
      return { text, literal: true };
    }
    const literal = comment;
    const open = comment ? undefined : FENCE_OPEN_RE.exec(text);
    // A backtick fence's info string may not hold a backtick; such a line is inline code.
    if (open?.[1] && !(open[1].startsWith("`") && open[2]?.includes("`"))) {
      fence = { char: open[1].charAt(0), length: open[1].length };
      return { text, literal: true };
    }
    comment = commentOpenAfter(text, comment);
    return { text, literal };
  });
}

/** Whether an HTML comment is still open after `text`, given whether one was open before it. */
function commentOpenAfter(text: string, open: boolean): boolean {
  let inside = open;
  let at = 0;
  while (at < text.length) {
    const next = text.indexOf(inside ? "-->" : "<!--", at);
    if (next < 0) {
      break;
    }
    at = next + (inside ? 3 : 4);
    inside = !inside;
  }
  return inside;
}
