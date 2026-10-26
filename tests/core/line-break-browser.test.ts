import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Browser } from "playwright";
import { importPlaywright, playwrightResolved } from "../../src/core/playwright.ts";

// Where a real Chromium breaks a slide's lines: what a theme asks for, and what lint measures.
const skip = !playwrightResolved() || Boolean(process.env.DEK_PLAYWRIGHT);
const browserTest = test.serial.skipIf(skip);

let browser: Browser | undefined;

beforeAll(async () => {
  if (!skip) {
    browser = await (await importPlaywright()).chromium.launch({ headless: true });
  }
});

afterAll(async () => {
  await browser?.close();
});

const theme = readFileSync(
  join(import.meta.dir, "..", "..", "src", "theme", "default.css"),
  "utf8",
);

/** Each element's text as the page breaks it into lines, by the element's id. */
async function linesOf(html: string): Promise<Record<string, string[]>> {
  if (!browser) {
    throw new Error("no browser");
  }
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
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
              lines.push("");
              bottom = rect.bottom;
            }
            lines[lines.length - 1] += text[at];
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
