import { describe, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { measureTextFlowsInPage } from "../../src/core/line-break.ts";
import { playwrightResolved } from "../../src/core/playwright.ts";
import { runVisualRequest } from "../../src/core/playwright-visual.ts";
import { measureSlideInPage } from "../../src/core/slide-measure.ts";
import { serialBrowserTest, sharedBrowser } from "../helpers/browser.ts";

// Where a real Chromium breaks a slide's lines: what a theme asks for, and what lint measures.
const skip = !playwrightResolved() || Boolean(process.env.DEK_PLAYWRIGHT);
const browserTest = serialBrowserTest(skip);
const withBrowser = sharedBrowser();

const theme = readFileSync(
  join(import.meta.dir, "..", "..", "src", "theme", "default.css"),
  "utf8",
);

/** Each element's text as the page breaks it into lines, by the element's id. */
async function linesOf(html: string): Promise<Record<string, string[]>> {
  const page = await withBrowser((browser) =>
    browser.newPage({ viewport: { width: 1280, height: 720 } }),
  );
  try {
    await page.setContent(html);
    return await page.evaluate(() =>
      Object.fromEntries(
        [...document.querySelectorAll("[id]")].map((el) => {
          const lines: string[] = [];
          let bottom = Number.NEGATIVE_INFINITY;
          const node = el.firstChild as Text;
          const text = node.textContent ?? "";
          for (let at = 0; at < text.length; at++) {
            const range = document.createRange();
            range.setStart(node, at);
            range.setEnd(node, at + 1);
            const rect = range.getBoundingClientRect();
            if (rect.top >= bottom - 1) {
              lines.push(text[at] ?? "");
              bottom = rect.bottom;
            } else {
              lines.push(`${lines.pop() ?? ""}${text[at] ?? ""}`);
            }
          }
          return [el.id, lines];
        }),
      ),
    );
  } finally {
    await page.close();
  }
}

describe("the bundled theme's line breaks", () => {
  const slide = (body: string) =>
    `<html lang="ja"><head><style>${theme}</style></head><body style="margin:0;width:1280px;height:720px"><section class="slide" data-layout="default">${body}</section></body></html>`;

  browserTest("breaks Japanese between phrases, not inside a word", async () => {
    const phrases = ["キャッシュが", "冷えると", "ビルドが", "落ちる", "理由を", "説明します"];
    const lines = await linesOf(slide(`<p id="body" style="width:240px">${phrases.join("")}</p>`));
    // Whatever the fonts measure, every line is whole phrases.
    const whole = new RegExp(`^(?:${phrases.join("|")})+$`);
    expect(lines.body?.length).toBeGreaterThan(1);
    expect(lines.body?.filter((line) => !whole.test(line))).toEqual([]);
  });

  browserTest("balances a heading, so its last line is not left with a word or two", async () => {
    const lines = await linesOf(
      slide(
        `<h2 id="title" class="slide-title" style="width:900px">一スライドに一つのメッセージを置くのが大事です</h2>`,
      ),
    );
    expect(lines.title?.length).toBe(2);
    expect(lines.title?.[1]?.length).toBeGreaterThan(4);
  });
});

/**
 * What `measureTextFlowsInPage` finds on a slide, each flow named by its element as the other
 * measurements name it, with its lines as text; and whether measuring left the slide as it was.
 */
async function flowsOf(body: string, css = "", lang = "ja") {
  const page = await withBrowser((browser) =>
    browser.newPage({ viewport: { width: 1280, height: 720 } }),
  );
  try {
    await page.setContent(`<html lang="${lang}"><head><style>
body { margin: 0 }
.slide { width: 1280px; height: 720px; font: 400 32px sans-serif }
p, h2, div, ul, li { margin: 0 }
${css}
</style></head><body><section class="slide">${body}</section></body></html>`);
    const before = await page.evaluate(() => document.querySelector(".slide")?.outerHTML);
    const { elements } = await page.evaluate(measureSlideInPage);
    const measured = await page.evaluate(measureTextFlowsInPage);
    const after = await page.evaluate(() => document.querySelector(".slide")?.outerHTML);
    const flows = measured.flows.map(({ element, text, lines, phrased, textWrap }) => {
      const at = (starts: number[]) =>
        starts.map((start, index) =>
          text
            .slice(start, starts[index + 1] ?? text.length)
            .replace(/\s+/g, " ")
            .trim(),
        );
      return {
        box: elements[element]?.box,
        lines: at(lines.map(({ start }) => start)),
        forced: lines.map(({ forced }) => forced),
        ...(phrased ? { phrased: at(phrased) } : {}),
        textWrap,
      };
    });
    return { wordBreak: measured.wordBreak, flows, untouched: before === after };
  } finally {
    await page.close();
  }
}

describe("measureTextFlowsInPage", () => {
  const sentence = "キャッシュが冷えるとビルドが落ちる理由を説明します";

  browserTest("lists each text that takes more than one line, with its lines", async () => {
    const found = await flowsOf(
      `<p class="one">一行</p><p class="two" style="width:9em">${sentence}</p>`,
      ".slide { word-break: auto-phrase }",
    );
    expect(found.flows.map(({ box }) => box)).toEqual(["p.two"]);
    expect(found.flows[0]?.lines.join("")).toBe(sentence);
    expect(found.flows[0]?.forced.every((forced) => !forced)).toBe(true);
    expect(found.untouched).toBe(true);
  });

  browserTest("reads the inline elements in a text as part of its lines", async () => {
    const found = await flowsOf(
      `<p class="mixed" style="width:9em">キャッシュが<strong>冷えると</strong>ビルドが<a>落ちる</a>理由を説明します</p>`,
      ".slide { word-break: auto-phrase }",
    );
    expect(found.flows.map(({ box, lines }) => [box, lines.join("")])).toEqual([
      ["p.mixed", sentence],
    ]);
  });

  browserTest("marks a line a <br> or a block inside the text starts", async () => {
    const found = await flowsOf(
      `<p class="br">一行目<br>二行目</p><div class="host">前の文<p class="inner">中の段落</p>後の文</div>`,
    );
    expect(found.flows.map(({ box, lines, forced }) => ({ box, lines, forced }))).toEqual([
      { box: "p.br", lines: ["一行目", "二行目"], forced: [false, true] },
      { box: "div.host", lines: ["前の文", "後の文"], forced: [false, true] },
    ]);
  });

  browserTest(
    "marks a line a newline the text keeps starts, as white-space: pre-line keeps it",
    async () => {
      const found = await flowsOf(`<p class="kept" style="white-space: pre-line">0 件。
完成。</p>`);
      expect(found.flows.map(({ lines, forced }) => ({ lines, forced }))).toEqual([
        { lines: ["0 件。", "完成。"], forced: [false, true] },
      ]);
    },
  );

  browserTest(
    "reads an inline box on a line, a chip or an inline-block, as what it holds",
    async () => {
      const found = await flowsOf(
        `<p class="chips" style="width:9em">持ち時間は先頭の<span style="display:inline-block; width:6em">duration</span>に。</p>`,
        ".slide { word-break: auto-phrase }",
      );
      expect(found.flows.map(({ lines }) => lines.at(-1))).toEqual(["durationに。"]);
    },
  );

  browserTest(
    "says where Japanese would break phrase by phrase, where the page breaks it elsewhere",
    async () => {
      const found = await flowsOf(`<p class="narrow" style="width:9em">${sentence}</p>`);
      const [flow] = found.flows;
      expect(flow?.phrased).toBeDefined();
      expect(flow?.phrased).not.toEqual(flow?.lines);
      expect(flow?.phrased?.join("")).toBe(sentence);
      expect(found.wordBreak).toBe("normal");
      expect(found.untouched).toBe(true);
    },
  );

  browserTest("says nothing more where the text already breaks by phrase", async () => {
    const found = await flowsOf(
      `<p class="narrow" style="width:9em">${sentence}</p>`,
      ".slide { word-break: auto-phrase; text-wrap: balance }",
    );
    expect(found.flows[0]?.phrased).toBeUndefined();
    expect(found.wordBreak).toBe("auto-phrase");
    expect(found.flows[0]?.textWrap).toBe("balance");
  });

  browserTest("leaves English, and the word-break an author chose, as they are", async () => {
    const english = await flowsOf(
      `<p class="narrow" style="width:9em">The cache goes cold and the build fails for this reason</p>`,
      "",
      "en",
    );
    expect(english.flows[0]?.phrased).toBeUndefined();
    const chosen = await flowsOf(
      `<p class="narrow" style="width:9em; word-break: break-all">${sentence}</p>`,
    );
    expect(chosen.flows[0]?.phrased).toBeUndefined();
  });

  browserTest("leaves code, drawings, and decoration out", async () => {
    const found = await flowsOf(
      `<pre style="width:200px; white-space: pre-wrap">${sentence}</pre>
<p style="width:9em">本文は<code>${sentence}</code></p>
<svg width="300" height="100"><text x="0" y="40">${sentence}</text></svg>
<p aria-hidden="true" style="width:9em">${sentence}</p>`,
    );
    expect(found.flows.map(({ box }) => box)).toEqual(["p"]);
  });
});

describe("playwright worker line breaks", () => {
  const measure = async (
    body: string,
    css = "",
    actions: Array<"breaks" | "fill"> = ["breaks"],
  ) => {
    return withBrowser((browser) =>
      runVisualRequest(browser, {
        kind: "pages",
        viewport: { width: 1280, height: 720 },
        actions,
        pages: [
          {
            html: `<html lang="ja"><head><style>
body { margin: 0 }
.slide { width: 1280px; height: 720px; font: 400 32px sans-serif }
p, h2 { margin: 0 }
${css}
</style></head><body><section class="slide">${body}</section></body></html>`,
            slug: "intro",
            step: "1",
          },
        ],
      }),
    );
  };

  // Widths in em and ch hold as many characters whatever fonts the machine has.
  browserTest("reports a phrase a line breaks inside, with the slide's word-break", async () => {
    const response = await measure(
      `<h2 class="slide-title" style="width:8em">キャッシュが冷えるとビルドが落ちる</h2>`,
    );
    expect(response.lineBreaks).toEqual([
      expect.objectContaining({
        slug: "intro",
        step: "1",
        box: "h2.slide-title",
        text: "キャッシュが冷えるとビルドが落ちる",
        kind: "split",
        wordBreak: "normal",
        textWrap: "wrap",
      }),
    ]);
  });

  browserTest("reports a paragraph that ends on a remnant, with its text-wrap", async () => {
    const response = await measure(
      `<p class="tail" lang="en">aaaa bbbb cccc dd</p><p class="chosen" lang="en">aaaa bbbb cccc<br>dd</p>`,
      ".slide p { font-family: monospace; width: 14ch; text-wrap: wrap }",
    );
    expect(response.lineBreaks).toEqual([
      expect.objectContaining({ box: "p.tail", kind: "short", tail: "dd", textWrap: "wrap" }),
    ]);
  });

  browserTest("measures line breaks only when asked", async () => {
    const response = await measure(
      `<h2 class="slide-title" style="width:8em">キャッシュが冷えるとビルドが落ちる</h2>`,
      "",
      ["fill"],
    );
    expect(response.lineBreaks ?? []).toEqual([]);
  });
});
