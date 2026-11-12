import { afterAll, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { type PageConfig, pageConfigAttrs, readPageConfig } from "../../src/core/page.ts";

const window = new Window();
afterAll(() => window.happyDOM.close());

/** `config` written on a body and read back, as the page and the player do. */
function roundTrip(attrs: string): PageConfig {
  const doc = new window.DOMParser().parseFromString(`<body${attrs}></body>`, "text/html");
  return readPageConfig(doc.body as unknown as HTMLElement);
}

describe("the page's settings on <body>", () => {
  test("carry the slide's size, for the embed API to say what its boxes are measured in", () => {
    const config: PageConfig = { mode: "player", deck: "demo", size: { width: 1024, height: 768 } };
    expect(pageConfigAttrs(config)).toContain(' data-size="1024x768"');
    expect(roundTrip(pageConfigAttrs(config))).toEqual(config);
  });

  test("leave out a size that is missing or does not read", () => {
    expect(roundTrip(' data-deck="demo"')).toEqual({ mode: "player", deck: "demo" });
    expect(roundTrip(' data-deck="demo" data-size="wide"')).toEqual({
      mode: "player",
      deck: "demo",
    });
  });
});
