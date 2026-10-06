import { describe, expect, test } from "bun:test";
import {
  type AnnotationRow,
  cutText,
  formatNotes,
  reanchor,
  type TargetRow,
} from "../../src/core/annotation-rows.ts";

const slides = [
  { slug: "cover", title: "Cover" },
  { slug: "roadmap", title: "次の四半期のロードマップ" },
];

const arrow: TargetRow = {
  path: "/p/decks/plan/slides/roadmap.html",
  line: 58,
  column: 7,
  found: true,
  name: "div.arrow.arrow-up",
  was: "",
  text: "",
  box: { x: 1188, y: 286, width: 24, height: 290 },
};

function chevron(line: number, text: string): TargetRow {
  return {
    path: "/p/decks/plan/slides/roadmap.html",
    line,
    column: 7,
    found: true,
    name: "div.chevron",
    was: text,
    text,
    box: { x: 150, y: 380 + (line - 30) * 30, width: 220, height: 24 },
  };
}

let numbered = 0;
function row(slug: string, step: string, targets: TargetRow[], text: string): AnnotationRow {
  numbered++;
  return {
    number: numbered,
    id: `n${numbered}`,
    slug,
    step,
    status: "open",
    text,
    targets,
    changed: [],
    shot: `dekc shot plan ${slug} --step ${step}`,
    createdAt: "2026-10-06T10:00:00.000Z",
  };
}

describe("formatNotes", () => {
  test("hands each note over with where its elements are written and how to see them", () => {
    numbered = 0;
    const rows = [
      row("roadmap", "milestones", [arrow], "矢じりを大きく"),
      row(
        "roadmap",
        "milestones",
        [chevron(30, "画面デザイン"), chevron(31, "デザインレビュー")],
        "右端を揃えて\n長さも同じに",
      ),
    ];
    expect(formatNotes("plan", slides, rows)).toBe(`## Notes on decks/plan

Boxes and points are in the slide's own pixels, from its top left.

### Slide 2 of 2, roadmap ("次の四半期のロードマップ"), at beat \`milestones\`

1. div.arrow.arrow-up at decks/plan/slides/roadmap.html:58:7 (box 1188,286 24×290)
   > 矢じりを大きく

2. 2 elements:
   - div.chevron "画面デザイン" at decks/plan/slides/roadmap.html:30:7 (box 150,380 220×24)
   - div.chevron "デザインレビュー" at decks/plan/slides/roadmap.html:31:7 (box 150,410 220×24)
   > 右端を揃えて
   > 長さも同じに

To see it: \`dekc shot plan roadmap --step milestones\`
`);
  });

  test("groups the notes by slide and beat in the order given, with their numbers", () => {
    numbered = 0;
    const text = formatNotes("plan", slides, [
      row("cover", "0", [chevron(30, "x")], "a"),
      row("roadmap", "milestones", [arrow], "c"),
      row("roadmap", "2", [arrow], "b"),
    ]);
    expect(text.match(/^### .*$/gm)).toEqual([
      '### Slide 1 of 2, cover ("Cover"), as it arrives',
      '### Slide 2 of 2, roadmap ("次の四半期のロードマップ"), at beat `milestones`',
      '### Slide 2 of 2, roadmap ("次の四半期のロードマップ"), at beat 2',
    ]);
    expect(text.match(/^\d+\. .*$/gm)?.map((line) => line.slice(0, 2))).toEqual(["1.", "2.", "3."]);
    expect(text.match(/--step [^`]+/g)).toEqual(["--step 0", "--step milestones", "--step 2"]);
  });

  test("names the slide itself by the point clicked rather than its box", () => {
    numbered = 0;
    const slide: TargetRow = {
      ...arrow,
      line: 4,
      column: 3,
      name: "section.slide",
      box: { x: 0, y: 0, width: 1280, height: 720 },
      point: { x: 640, y: 512 },
    };
    const text = formatNotes("plan", slides, [row("cover", "0", [slide], "ここに矢印を足す")]);
    expect(text).toContain(
      "1. section.slide at decks/plan/slides/cover.html:4:3 (point 640,512)\n   > ここに矢印を足す",
    );
  });

  test("leaves the words out of a note that only points, to be said in the chat", () => {
    numbered = 0;
    const text = formatNotes("plan", slides, [row("cover", "0", [arrow], "  ")]);
    expect(text).toContain("(box 1188,286 24×290)\n\nTo see it:");
  });

  test("says when an element was not found after an edit, and quotes it as it was", () => {
    numbered = 0;
    const lost = { ...chevron(30, "設計"), found: false, text: null };
    const text = formatNotes("plan", slides, [row("cover", "0", [lost], "a")]);
    expect(text).toContain(
      '1. div.chevron "設計" at decks/plan/slides/cover.html:30:7 (box 150,380 220×24), as written before an edit; the line may have moved',
    );
  });

  test("quotes an element's text as the file has it now", () => {
    numbered = 0;
    const rewritten = { ...chevron(30, "設計"), text: "実装" };
    expect(formatNotes("plan", slides, [row("cover", "0", [rewritten], "")])).toContain(
      'div.chevron "実装" at',
    );
  });

  test("quotes text the way JSON does, so a quote inside it cannot end it", () => {
    numbered = 0;
    const text = formatNotes("plan", slides, [row("cover", "0", [chevron(30, 'say "hi"')], "")]);
    expect(text).toContain('div.chevron "say \\"hi\\"" at');
  });

  test("is empty with no notes", () => {
    expect(formatNotes("plan", slides, [])).toBe("");
  });
});

describe("reanchor", () => {
  const now = (source: string, name: string, text: string) => ({ source, name, text });
  const target = (line: number, text: string) => now(`${line}:7`, "div.chevron", text);

  test("keeps an element that is where it was", () => {
    expect(reanchor(target(30, "設計"), [now("30:7", "div.chevron", "設計")])?.source).toBe("30:7");
  });

  test("follows an element that moved, by its name and text", () => {
    const found = reanchor(target(30, "設計"), [
      now("12:1", "div.lane", ""),
      now("33:7", "div.chevron", "設計"),
    ]);
    expect(found?.source).toBe("33:7");
  });

  test("follows an element whose text was rewritten, while it stays on its line", () => {
    expect(reanchor(target(30, "設計"), [now("30:7", "div.chevron", "画面設計")])).toEqual(
      now("30:7", "div.chevron", "画面設計"),
    );
  });

  test("follows an element whose classes were changed, while it stays where it was", () => {
    expect(reanchor(target(30, "設計"), [now("30:7", "div.chevron.is-now", "設計")])).toEqual(
      now("30:7", "div.chevron.is-now", "設計"),
    );
  });

  test("gives up on another kind of element in its place", () => {
    expect(reanchor(target(30, "設計"), [now("30:7", "svg.chevron", "設計")])).toBeUndefined();
  });

  test("gives up on a name and text that more than one element has", () => {
    expect(
      reanchor(target(30, "x"), [now("40:7", "div.chevron", "x"), now("41:7", "div.chevron", "x")]),
    ).toBeUndefined();
  });

  test("gives up on an element that went away", () => {
    expect(reanchor(target(30, "x"), [now("30:7", "p", "x")])).toBeUndefined();
  });
});

describe("cutText", () => {
  test("collapses whitespace and cuts a long text short", () => {
    expect(cutText("  a \n b  ")).toBe("a b");
    expect(cutText("x".repeat(50))).toBe(`${"x".repeat(40)}…`);
  });
});
