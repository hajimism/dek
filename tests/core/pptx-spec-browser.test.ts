import { describe, expect } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { type PlaywrightRunner, playwrightResolved } from "../../src/core/playwright.ts";
import { runVisualRequest } from "../../src/core/playwright-visual.ts";
import { pptxJsonSchema } from "../../src/core/pptx-json.ts";
import { type PptxSpec, type PptxSpecNode, pptxSpecDeck } from "../../src/core/pptx-spec.ts";
import { serialBrowserTest, sharedBrowser } from "../helpers/browser.ts";
import { withTempProject } from "../helpers/project.ts";

// `dekc pptx spec` in a real Chromium: what a slide is made of, as an agent rebuilding it reads it.
const skip = !playwrightResolved() || Boolean(process.env.DEK_PLAYWRIGHT);
const browserTest = serialBrowserTest(skip);
const withBrowser = sharedBrowser();
const runner: PlaywrightRunner = (request) =>
  withBrowser((browser) => runVisualRequest(browser, request));

const html = `<section class="slide" data-layout="default">
  <p class="kicker"><span class="badge"></span>Setup</p>
  <h2 class="slide-title">準備は、何もいらない AVATAR To We</h2>
  <p class="line">打つのは <span class="chip">dekc init</span> だけ。</p>
  <div class="glow"></div>
</section>`;

const css = `
.slide { counter-reset: page 4; }
.badge { display: inline-block; width: 20px; height: 20px; background: #4f46e5; border-radius: 99px; }
.badge::before { counter-increment: page; content: counter(page, decimal-leading-zero); color: #fff; font-size: 12px; }
.slide-title { font-feature-settings: "palt"; font-size: 48px; width: max-content; }
.chip { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 2px 6px; }
.glow { width: 200px; height: 100px; background: linear-gradient(90deg, #c7d2fe, transparent); }
`;

// What the trials' agents found missing: a terminal's gutter, blank line, and prompt; a strike
// drawn by an empty element; paint a pseudo-element draws past its host; and how text is placed.
const terminal = `<section class="slide" data-layout="default">
  <h2 class="slide-title">端末</h2>
  <div class="screen">
    <span class="line"><span class="gutter">1</span>&lt;section&gt;</span>
    <span class="line"> </span>
    <span class="line"><span class="prompt">~</span>dekc ls</span>
  </div>
  <p class="premise"><span class="struck"><span data-strike></span>スライド</span>ではない。</p>
  <p class="clock"><span class="big">2:42</span> / 3:00</p>
  <p class="dot">点</p>
  <p class="marked">ここは<span class="mark">大事</span>です</p>
  <div class="card">カード</div>
  <p class="split">左<span class="key"></span>右</p>
</section>`;

const terminalCss = `
.screen { font-family: monospace; font-size: 16px; line-height: 1.5; width: 600px; }
.line { display: block; min-height: 1.5em; white-space: pre-wrap; }
.gutter { display: inline-block; width: 2.4em; margin-right: 0.9em; text-align: right; color: #888888; }
.prompt { color: #00aa00; }
.prompt::after { content: " $ "; color: #555555; }
.struck { position: relative; }
[data-strike] { position: absolute; left: 0; right: 0; top: 50%; height: 4px; background: #ff0000; }
.clock { font-size: 24px; width: max-content; }
.big { font-size: 64px; }
.dot { position: relative; margin-left: 40px; width: max-content; }
.dot::before { content: ""; position: absolute; left: -30px; top: 4px; width: 12px; height: 12px; border-radius: 6px; background: #4f46e5; }
.mark { background: linear-gradient(transparent 60%, #fde68a 60%); }
.card { width: 200px; height: 60px; border-top: 2px dashed #334155; border-bottom: 1px solid #334155; box-shadow: 0 4px 12px rgba(15, 23, 42, 0.25); }
.split { width: max-content; }
.key { display: inline-block; width: 40px; height: 10px; margin: 0 30px; background: #22c55e; }
`;

// A table with a cell across two columns, one down two rows, and an empty cell.
const table = `<section class="slide" data-layout="default">
  <h2 class="slide-title">表</h2>
  <table class="bundle">
    <thead><tr><th colspan="2">部分</th><th>行数</th></tr></thead>
    <tbody>
      <tr><td>script</td><td>台本のその節</td><td rowspan="2" class="lines">8 行</td></tr>
      <tr><td></td><td>slides/timing.html</td></tr>
    </tbody>
  </table>
</section>`;

const tableCss = `
.bundle { position: absolute; left: 100px; top: 200px; border-collapse: collapse; font-size: 20px; }
.bundle th, .bundle td { padding: 4px 8px; border-bottom: 1px solid #cbd5e1; }
.bundle th { width: 120px; vertical-align: bottom; }
.bundle td { height: 40px; }
.bundle .lines { vertical-align: top; }
`;

// A span stops at the end of its row group, rowspan="0" too; a hidden cell takes no column.
const groups = `<section class="slide" data-layout="default">
  <h2 class="slide-title">表</h2>
  <table class="grouped">
    <thead><tr><th rowspan="2">H</th><th>B</th></tr></thead>
    <tbody>
      <tr><td>C</td><td>D</td></tr>
      <tr><td rowspan="0">E</td><td>F</td></tr>
      <tr><td>G</td></tr>
    </tbody>
    <tfoot><tr><td>X</td><td>Y</td></tr></tfoot>
  </table>
  <table class="hidden">
    <tr><td>a</td><td style="display: none">z</td><td>b</td></tr>
    <tr><td>c</td><td>d</td></tr>
  </table>
</section>`;

const groupsCss = `
table { position: absolute; left: 100px; border-collapse: collapse; font-size: 20px; }
.grouped { top: 200px; }
.hidden { top: 500px; }
td, th { padding: 4px; border: 1px solid #000000; }
`;

/** Every node of the outline, depth first. */
function nodes(node: PptxSpecNode | undefined): PptxSpecNode[] {
  return node ? [node, ...(node.children ?? []).flatMap(nodes)] : [];
}

describe("pptxSpecDeck in a browser", () => {
  browserTest("writes each slide's outline, its parts, and the deck as JSON to edit", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            script:
              "---\ntitle: Demo\nlang: ja\n---\n\n## 準備は、何もいらない {#setup}\n\nhello\n",
            slides: { setup: html },
            styles: { setup: css },
          },
        ],
      },
      async (root) => {
        const deck = join(root, "decks", "demo");
        const done = await pptxSpecDeck(deck, { runner });
        const spec = JSON.parse(readFileSync(done.spec, "utf8")) as PptxSpec;
        const [slide] = spec.slides;
        expect(slide).toMatchObject({ slug: "setup", layout: "default" });
        const all = nodes(slide?.outline);

        // A counter is counted, and its text is a node of its own where it is drawn.
        const mark = all.find((node) => node.tag === "::before");
        expect(mark?.text?.content).toBe("05");
        expect(mark?.width).toBeGreaterThan(0);

        // A chip's text stays its line's; the chip is a node too, for its box.
        const line = all.find((node) => node.class === "line");
        expect(line?.text?.content).toBe("打つのは dekc init だけ。");
        const chip = all.find((node) => node.class === "chip");
        expect(chip).toMatchObject({ inline: true, fill: "#f8fafc", radius: 6 });
        expect(chip?.padding).toEqual({ top: 2, right: 6, bottom: 2, left: 6 });

        // Proportional kana and kerned pairs come out wider where nothing spaces them: the pairs
        // in any font that kerns them, as CI's Linux has no kana with `palt`.
        const title = all.find((node) => node.heading === 2);
        expect(title?.text?.widen).toBeGreaterThan(1);

        // A gradient is a part, drawn alone, and says why.
        const glow = all.find((node) => node.class === "glow");
        expect(glow).toMatchObject({ picture: "drawn", drawn: ["gradient"] });
        expect(existsSync(join(deck, glow?.part ?? "missing"))).toBe(true);
        expect(existsSync(join(deck, slide?.shot ?? "missing"))).toBe(true);

        // What to start from is a file --from takes as it is.
        const start = JSON.parse(readFileSync(done.start, "utf8"));
        expect(pptxJsonSchema.safeParse(start).success).toBe(true);
      },
    );
  });

  browserTest(
    "writes where each stretch of text lies, and what the agents found missing",
    async () => {
      await withTempProject(
        {
          decks: [
            {
              name: "demo",
              script: "---\ntitle: Demo\nlang: ja\n---\n\n## 端末 {#terminal}\n\nhello\n",
              slides: { terminal },
              styles: { terminal: terminalCss },
            },
          ],
        },
        async (root) => {
          const deck = join(root, "decks", "demo");
          const done = await pptxSpecDeck(deck, { runner });
          const spec = JSON.parse(readFileSync(done.spec, "utf8")) as PptxSpec;
          const all = nodes(spec.slides[0]?.outline);
          const byClass = (name: string) => all.filter((node) => node.class === name);

          // A gutter's number is a stretch of its own, apart from the code after it, and its box.
          const [first, blank, prompt] = byClass("line");
          expect(first?.text?.pieces?.map((piece) => piece.text)).toEqual(["1", "<section>"]);
          const [number, code] = first?.text?.pieces ?? [];
          expect((code?.x ?? 0) - ((number?.x ?? 0) + (number?.width ?? 0))).toBeGreaterThan(10);
          expect(byClass("gutter")[0]).toMatchObject({ inline: true });

          // A blank line of a terminal is a line, not nothing.
          expect(blank?.text?.content).toBe(" ");
          expect(blank?.height).toBeGreaterThan(20);

          // What ::after writes is set in its own color, apart from its host's run.
          const runs = prompt?.text?.runs ?? [];
          expect(runs.map((run) => [run.text, run.color])).toEqual([
            ["~", "#00aa00"],
            [" $ ", "#555555"],
            ["dekc ls", expect.any(String)],
          ]);

          // A bar drawn by an empty element inside a line's words is a node.
          const strike = all.find((node) => node.fill === "#ff0000");
          expect(strike?.height).toBe(4);

          // One line of two sizes is one line.
          expect(byClass("clock")[0]?.text?.lines).toBe(1);

          // A pseudo-element's dot past its host's box is a node of its own, its host a plain text.
          const dot = byClass("dot")[0];
          const mark = dot?.children?.find((node) => node.tag === "::before");
          expect(mark).toMatchObject({ width: 12, height: 12, radius: 6, fill: "#4f46e5" });
          expect(mark?.x ?? 0).toBeLessThan(dot?.x ?? 0);
          expect(dot?.picture).toBeUndefined();

          // A marker drawn as a gradient is its run's background.
          const marked = byClass("marked")[0]?.text?.runs.find((run) => run.text === "大事");
          expect(marked?.background).toBe("#fde68a");

          // Each side says how it is drawn; a shadow says where it falls.
          const card = byClass("card")[0];
          expect(card?.sides?.top).toEqual({ width: 2, color: "#334155", style: "dashed" });
          expect(card?.shadow).toEqual([{ x: 0, y: 4, blur: 12, spread: 0, color: "#0f172a40" }]);

          // Words either side of a swatch are stretches apart, each where the browser set it.
          const split = byClass("split")[0]?.text?.pieces ?? [];
          expect(split.map((piece) => piece.text)).toEqual(["左", "右"]);
        },
      );
    },
  );

  browserTest(
    "writes a table's grid, and each cell's place on it, its empty ones too",
    async () => {
      await withTempProject(
        {
          decks: [
            {
              name: "demo",
              script: "---\ntitle: Demo\nlang: ja\n---\n\n## 表 {#table}\n\nhello\n",
              slides: { table },
              styles: { table: tableCss },
            },
          ],
        },
        async (root) => {
          const deck = join(root, "decks", "demo");
          const done = await pptxSpecDeck(deck, { runner });
          const spec = JSON.parse(readFileSync(done.spec, "utf8")) as PptxSpec;
          const all = nodes(spec.slides[0]?.outline);
          const grid = all.find((node) => node.tag === "table")?.grid;
          // Three columns, three rows, from the first cell's corner, as wide as the cells laid out.
          expect(grid?.columns).toHaveLength(3);
          expect(grid?.rows).toHaveLength(3);
          const cells = all.filter((node) => node.cell !== undefined);
          expect(cells.map((node) => [node.text?.content ?? "", node.cell])).toEqual([
            ["部分", { row: 0, column: 0, columnSpan: 2, anchor: "bottom" }],
            ["行数", { row: 0, column: 2, anchor: "bottom" }],
            ["script", { row: 1, column: 0, anchor: "middle" }],
            ["台本のその節", { row: 1, column: 1, anchor: "middle" }],
            ["8 行", { row: 1, column: 2, rowSpan: 2, anchor: "top" }],
            ["", { row: 2, column: 0, anchor: "middle" }],
            ["slides/timing.html", { row: 2, column: 1, anchor: "middle" }],
          ]);
          const [head, , script, , lines, empty] = cells;
          expect(grid?.x).toBe(head?.x);
          expect(grid?.y).toBe(head?.y);
          const sum = (values: number[] = []) => values.reduce((total, value) => total + value, 0);
          expect(sum(grid?.columns.slice(0, 2))).toBeCloseTo(head?.width ?? 0, 0);
          expect(grid?.columns[0]).toBeCloseTo(script?.width ?? 0, 0);
          expect(sum(grid?.rows.slice(1))).toBeCloseTo(lines?.height ?? 0, 0);
          expect(empty?.sides?.bottom).toEqual({ width: 1, color: "#cbd5e1" });
        },
      );
    },
  );

  browserTest(
    "ends a cell's span with its row group, and gives a hidden cell no column",
    async () => {
      await withTempProject(
        {
          decks: [
            {
              name: "demo",
              script: "---\ntitle: Demo\nlang: ja\n---\n\n## 表 {#groups}\n\nhello\n",
              slides: { groups },
              styles: { groups: groupsCss },
            },
          ],
        },
        async (root) => {
          const deck = join(root, "decks", "demo");
          const done = await pptxSpecDeck(deck, { runner });
          const spec = JSON.parse(readFileSync(done.spec, "utf8")) as PptxSpec;
          const all = nodes(spec.slides[0]?.outline);
          const [grouped, hidden] = all.filter((node) => node.tag === "table");
          const places = (table: PptxSpecNode | undefined) =>
            nodes(table)
              .filter((node) => node.cell !== undefined)
              .map((node) => {
                const { anchor: _anchor, ...place } = node.cell ?? { anchor: "top" };
                return [node.text?.content, place];
              });
          expect(places(grouped)).toEqual([
            ["H", { row: 0, column: 0 }],
            ["B", { row: 0, column: 1 }],
            ["C", { row: 1, column: 0 }],
            ["D", { row: 1, column: 1 }],
            ["E", { row: 2, column: 0, rowSpan: 2 }],
            ["F", { row: 2, column: 1 }],
            ["G", { row: 3, column: 1 }],
            ["X", { row: 4, column: 0 }],
            ["Y", { row: 4, column: 1 }],
          ]);
          expect(places(hidden)).toEqual([
            ["a", { row: 0, column: 0 }],
            ["b", { row: 0, column: 1 }],
            ["c", { row: 1, column: 0 }],
            ["d", { row: 1, column: 1 }],
          ]);
          for (const table of [grouped, hidden]) {
            const grid = table?.grid;
            expect(grid?.columns).toHaveLength(2);
            expect(grid?.columns.every((width) => width > 0)).toBe(true);
            expect(grid?.rows.every((height) => height > 0)).toBe(true);
            const first = nodes(table).find(
              (node) => node.cell?.row === 0 && node.cell.column === 0,
            );
            expect([grid?.x, grid?.y]).toEqual([first?.x, first?.y]);
          }
        },
      );
    },
  );
});
