import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Browser } from "playwright";
import { attributeOf } from "../../src/core/attribute-value.ts";
import { LEGACY_REFERENCES, NAMED_REFERENCES } from "../../src/core/html-entities.ts";
import { textRuns } from "../../src/core/phrases.ts";
import { importPlaywright, playwrightResolved } from "../../src/core/playwright.ts";
import { ATTRIBUTE_VALUES } from "../helpers/attribute-values.ts";

// The decoder against the browser it stands in for: Chromium's own parser reads every value.
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

/** Each value written between double quotes, as Chromium reads it and as dek does. */
async function readBoth(values: readonly string[]): Promise<{ chromium: string[]; dek: string[] }> {
  if (!browser) {
    throw new Error("no browser");
  }
  const html = values.map((value) => `<p data-v="${value}"></p>`).join("\n");
  const dek: string[] = [];
  new HTMLRewriter()
    .on("p", {
      element(el) {
        dek.push(attributeOf(el, "data-v") ?? "");
      },
    })
    .transform(html);
  const page = await browser.newPage();
  try {
    await page.setContent(`<!DOCTYPE html><body>${html}</body>`);
    const chromium = await page.evaluate(() =>
      [...document.querySelectorAll("p")].map((p) => p.getAttribute("data-v") ?? ""),
    );
    return { chromium, dek };
  } finally {
    await page.close();
  }
}

describe("attribute values, as Chromium reads them", () => {
  browserTest("are what the corpus says they are, and what dek reads", async () => {
    const { chromium, dek } = await readBoth(ATTRIBUTE_VALUES.map(([written]) => written));
    expect(chromium).toEqual(ATTRIBUTE_VALUES.map(([, read]) => read));
    expect(dek).toEqual(chromium);
  });

  browserTest("match dek for every named reference, with and without its ;", async () => {
    const names = NAMED_REFERENCES.split(" ").map((entry) => entry.split(":")[0] ?? "");
    const legacy = LEGACY_REFERENCES.split(" ");
    const values = [
      ...names.flatMap((name) => [`&${name};`, `&${name};x`, `&${name}`]),
      ...legacy.flatMap((name) => [
        `&${name}=`,
        `&${name}x`,
        `&${name}1`,
        `&${name} `,
        `&${name}-`,
      ]),
    ];
    const { chromium, dek } = await readBoth(values);
    expect(dek).toEqual(chromium);
  });

  browserTest("match dek for every numeric reference to the first 0x100 code points", async () => {
    const values = [...Array(0x100).keys()].flatMap((n) => [`&#${n};`, `&#x${n.toString(16)}`]);
    const { chromium, dek } = await readBoth(values);
    expect(dek).toEqual(chromium);
  });
});

/** Each text written in its own paragraph, as Chromium's text node holds it and as dek reads it. */
async function readTexts(texts: readonly string[]): Promise<{ chromium: string[]; dek: string[] }> {
  if (!browser) {
    throw new Error("no browser");
  }
  const html = `<section class="slide">${texts.map((text) => `<p>${text}</p>`).join("")}</section>`;
  const page = await browser.newPage();
  try {
    await page.setContent(`<!DOCTYPE html><body>${html}</body>`);
    const chromium = await page.evaluate(() =>
      [...document.querySelectorAll("p")].map((p) => p.textContent ?? ""),
    );
    return { chromium, dek: textRuns(html) };
  } finally {
    await page.close();
  }
}

describe("texts, as Chromium reads them", () => {
  browserTest("match dek for every named reference, with and without its ;", async () => {
    const names = NAMED_REFERENCES.split(" ").map((entry) => entry.split(":")[0] ?? "");
    const legacy = LEGACY_REFERENCES.split(" ");
    const texts = [
      ...names.flatMap((name) => [`a&${name};x`, `a&${name}`]),
      ...legacy.flatMap((name) => [`a&${name}=`, `a&${name}x;`, `a&${name}1`, `a&${name} `]),
    ];
    const { chromium, dek } = await readTexts(texts);
    expect(dek).toEqual(chromium);
  });

  browserTest("match dek for numeric references, line ends, and a NUL", async () => {
    const texts = [
      ...[...Array(0x100).keys()].flatMap((n) => [`a&#${n};`, `a&#x${n.toString(16)}b`]),
      "a\r\nb\rc",
      "a\0b",
      "a&#xd800;b&#x110000;c",
    ];
    const { chromium, dek } = await readTexts(texts);
    expect(dek).toEqual(chromium);
  });
});
