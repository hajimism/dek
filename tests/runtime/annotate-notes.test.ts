import { describe, expect, test } from "bun:test";
import {
  formatNotes,
  type Note,
  type NoteTarget,
  readNotes,
  reanchor,
} from "../../src/runtime/annotate-notes.ts";

const slides = [
  { slug: "cover", title: "Cover", beats: [] },
  { slug: "roadmap", title: "次の四半期のロードマップ", beats: [{ id: "milestones" }, {}] },
];

const arrow: NoteTarget = {
  source: "58:7",
  name: "div.arrow.arrow-up",
  text: "",
  box: { x: 1188, y: 286, width: 24, height: 290 },
};

function chevron(line: number, text: string): NoteTarget {
  return {
    source: `${line}:7`,
    name: "div.chevron",
    text,
    box: { x: 150, y: 380 + (line - 30) * 30, width: 220, height: 24 },
  };
}

describe("formatNotes", () => {
  test("hands each note over with where its elements are written and how to see them", () => {
    const notes: Note[] = [
      { slug: "roadmap", step: "milestones", targets: [arrow], text: "矢じりを大きく" },
      {
        slug: "roadmap",
        step: "milestones",
        targets: [chevron(30, "画面デザイン"), chevron(31, "デザインレビュー")],
        text: "右端を揃えて\n長さも同じに",
      },
    ];
    expect(formatNotes("plan", slides, notes)).toBe(`## Notes on decks/plan

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

  test("groups notes by slide and beat in talk order, numbering them through", () => {
    const notes: Note[] = [
      { slug: "roadmap", step: "2", targets: [arrow], text: "b" },
      { slug: "cover", step: "0", targets: [chevron(30, "x")], text: "a" },
      { slug: "roadmap", step: "milestones", targets: [arrow], text: "c" },
    ];
    const text = formatNotes("plan", slides, notes);
    expect(text.match(/^### .*$/gm)).toEqual([
      '### Slide 1 of 2, cover ("Cover"), as it arrives',
      '### Slide 2 of 2, roadmap ("次の四半期のロードマップ"), at beat `milestones`',
      '### Slide 2 of 2, roadmap ("次の四半期のロードマップ"), at beat 2',
    ]);
    expect(text.match(/^\d+\. .*$/gm)?.map((line) => line.slice(0, 2))).toEqual(["1.", "2.", "3."]);
    expect(text.match(/--step [^`]+/g)).toEqual(["--step 0", "--step milestones", "--step 2"]);
  });

  test("names the slide itself by the point clicked rather than its box", () => {
    const slide: NoteTarget = {
      source: "4:3",
      name: "section.slide",
      text: "",
      box: { x: 0, y: 0, width: 1280, height: 720 },
      point: { x: 640, y: 512 },
    };
    const text = formatNotes("plan", slides, [
      { slug: "cover", step: "0", targets: [slide], text: "ここに矢印を足す" },
    ]);
    expect(text).toContain(
      "1. section.slide at decks/plan/slides/cover.html:4:3 (point 640,512)\n   > ここに矢印を足す",
    );
  });

  test("leaves the words out of a note that only points, to be said in the chat", () => {
    const text = formatNotes("plan", slides, [
      { slug: "cover", step: "0", targets: [arrow], text: "  " },
    ]);
    expect(text).toContain("(box 1188,286 24×290)\n\nTo see it:");
  });

  test("says when a note was written before an edit it could not follow", () => {
    const text = formatNotes("plan", slides, [
      { slug: "cover", step: "0", targets: [arrow], text: "a", stale: true },
    ]);
    expect(text).toContain(
      "1. div.arrow.arrow-up at decks/plan/slides/cover.html:58:7 (box 1188,286 24×290), as written before an edit; the line may have moved",
    );
  });

  test("quotes text the way JSON does, so a quote inside it cannot end it", () => {
    const text = formatNotes("plan", slides, [
      { slug: "cover", step: "0", targets: [chevron(30, 'say "hi"')], text: "" },
    ]);
    expect(text).toContain('div.chevron "say \\"hi\\"" at');
  });

  test("is empty with no notes", () => {
    expect(formatNotes("plan", slides, [])).toBe("");
  });
});

describe("reanchor", () => {
  const now = (source: string, name: string, text: string) => ({ source, name, text });

  test("keeps an element that is where it was", () => {
    const target = chevron(30, "設計");
    expect(reanchor(target, [now("30:7", "div.chevron", "設計")])?.source).toBe("30:7");
  });

  test("follows an element that moved, by its name and text", () => {
    const target = chevron(30, "設計");
    const found = reanchor(target, [
      now("12:1", "div.lane", ""),
      now("33:7", "div.chevron", "設計"),
    ]);
    expect(found?.source).toBe("33:7");
  });

  test("follows an element whose text was rewritten, while it stays on its line", () => {
    const target = chevron(30, "設計");
    expect(reanchor(target, [now("30:7", "div.chevron", "画面設計")])).toEqual(
      now("30:7", "div.chevron", "画面設計"),
    );
  });

  test("gives up on a name and text that more than one element has", () => {
    const target = chevron(30, "x");
    expect(
      reanchor(target, [now("40:7", "div.chevron", "x"), now("41:7", "div.chevron", "x")]),
    ).toBeUndefined();
  });

  test("gives up on an element that went away", () => {
    expect(reanchor(chevron(30, "x"), [now("30:7", "p", "x")])).toBeUndefined();
  });
});

describe("readNotes", () => {
  test("reads back what was kept", () => {
    const notes: Note[] = [{ slug: "cover", step: "0", targets: [arrow], text: "a" }];
    expect(readNotes(JSON.stringify({ version: 1, notes }))).toEqual(notes);
  });

  test("starts over from anything else", () => {
    for (const raw of [null, "", "{", "[]", '{"version":2,"notes":[]}', '{"version":1}']) {
      expect(readNotes(raw)).toEqual([]);
    }
    const broken = { version: 1, notes: [{ slug: "cover", step: "0", targets: [{}], text: "" }] };
    expect(readNotes(JSON.stringify(broken))).toEqual([]);
  });
});
