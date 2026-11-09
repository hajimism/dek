import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { phraseBoundaries } from "../../src/core/budoux/parser.ts";
import { PHRASES_ATTRIBUTE } from "../../src/core/phrase-runs.ts";
import { phraseTable } from "../../src/core/phrases.ts";
import { breakPhrases } from "../../src/runtime/phrases.ts";

/** A slide section as the build stamps it: its table of phrases on it, escaped for the attribute. */
function stamped(inner: string): string {
  const html = `<section class="slide">${inner}</section>`;
  const table = JSON.stringify(phraseTable(html))
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;");
  return html.replace("<section", `<section ${PHRASES_ATTRIBUTE}="${table}"`);
}

/** The slide's markup with each <wbr> written as a slash, the way a test reads it. */
function marked(): string {
  return (document.querySelector(".slide")?.innerHTML ?? "").replaceAll("<wbr>", "/");
}

const unsupported = () => false;

describe("breakPhrases", () => {
  beforeEach(() => {
    GlobalRegistrator.register();
  });
  afterEach(async () => {
    await GlobalRegistrator.unregister();
  });

  test("puts a <wbr> where each phrase starts, in a browser without auto-phrase", () => {
    const text = "台本を先に書いてから画面を組み立てる";
    document.body.innerHTML = stamped(`<p>${text}</p>`);
    breakPhrases(document, unsupported);
    let at = 0;
    const expected = phraseBoundaries(text)
      .map((boundary) => {
        const piece = text.slice(at, boundary);
        at = boundary;
        return piece;
      })
      .concat(text.slice(at))
      .join("/");
    expect(marked()).toBe(`<p>${expected}</p>`);
  });

  test("breaks a run across inline elements, inside the one a boundary falls in", () => {
    document.body.innerHTML = stamped("<p>台本を<strong>先に書いて</strong>から組み立てる</p>");
    breakPhrases(document, unsupported);
    expect(document.querySelectorAll("wbr").length).toBe(
      phraseBoundaries("台本を先に書いてから組み立てる").length,
    );
    expect(document.querySelector("p")?.textContent).toBe("台本を先に書いてから組み立てる");
    expect(document.querySelector("strong")?.textContent).toBe("先に書いて");
  });

  test("leaves a browser that breaks by phrase on its own alone", () => {
    document.body.innerHTML = stamped("<p>台本を先に書いてから画面を組み立てる</p>");
    breakPhrases(document, () => true);
    expect(document.querySelector("wbr")).toBeNull();
    expect(document.querySelector(".slide")?.hasAttribute(PHRASES_ATTRIBUTE)).toBe(true);
  });

  test("passes over a text the table does not hold, as one a script changed", () => {
    document.body.innerHTML = stamped("<p>台本を先に書いてから画面を組み立てる</p>");
    const p = document.querySelector("p") as HTMLParagraphElement;
    p.textContent = "画面を先に組み立ててから台本を書く";
    breakPhrases(document, unsupported);
    expect(document.querySelector("wbr")).toBeNull();
  });

  test("breaks each slide once, however often it is called", () => {
    document.body.innerHTML = stamped("<p>台本を先に書いてから画面を組み立てる</p>");
    breakPhrases(document, unsupported);
    const once = marked();
    breakPhrases(document, unsupported);
    expect(marked()).toBe(once);
    expect(document.querySelector(".slide")?.hasAttribute(PHRASES_ATTRIBUTE)).toBe(false);
  });

  test("reaches a slide passed as the root itself, as a live update swaps one in", () => {
    document.body.innerHTML = stamped("<p>台本を先に書いてから画面を組み立てる</p>");
    breakPhrases(document.querySelector(".slide") as Element, unsupported);
    expect(document.querySelector("wbr")).not.toBeNull();
  });

  test("ignores a table it cannot read", () => {
    document.body.innerHTML = `<section class="slide" ${PHRASES_ATTRIBUTE}="{"><p>台本を書く</p></section>`;
    breakPhrases(document, unsupported);
    expect(document.querySelector("wbr")).toBeNull();
  });

  test("reads ruby as its base and leaves code alone", () => {
    const html =
      "<p><ruby>台本<rt>だいほん</rt></ruby>を先に書いて<code>dekc</code>から画面を組み立てる</p>";
    document.body.innerHTML = stamped(html);
    breakPhrases(document, unsupported);
    expect(document.querySelector("rt")?.innerHTML).toBe("だいほん");
    expect(document.querySelector("code")?.innerHTML).toBe("dekc");
    expect(document.querySelectorAll("wbr").length).toBe(
      phraseBoundaries("台本を先に書いて").length + phraseBoundaries("から画面を組み立てる").length,
    );
  });
});
