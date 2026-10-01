import { describe, expect, test } from "bun:test";
import { scanSlideHtml } from "../../src/core/html-scan.ts";
import { srcsetUrls } from "../../src/core/url-attributes.ts";

describe("scanSlideHtml locates what it finds", () => {
  test("every element and attribute carries its line and column", () => {
    const scan = scanSlideHtml(`<section class="slide">
  <!-- <p style="x"> is a comment -->
  <p title="a > b" style="color: red">x</p>
    <b
      onclick="go()">y</b>
</section>`);
    const p = scan.elements.find((element) => element.tag === "p");
    expect(p).toMatchObject({ line: 3, column: 3 });
    expect(p?.attributes).toEqual([
      { name: "title", value: "a > b", line: 3, column: 6 },
      { name: "style", value: "color: red", line: 3, column: 20 },
    ]);
    const b = scan.elements.find((element) => element.tag === "b");
    expect(b).toMatchObject({ line: 4, column: 5 });
    expect(b?.attributes).toEqual([{ name: "onclick", value: "go()", line: 5, column: 7 }]);
  });

  test("counts columns the way an editor does, after wide characters", () => {
    const scan = scanSlideHtml(`<section class="slide"><p>日本語</p><img src="a.png"></section>`);
    expect(scan.refs[0]).toMatchObject({ value: "a.png", line: 1, column: 44 });
  });

  test("keeps its bookkeeping out of the way of any text in the file", () => {
    const scan = scanSlideHtml(`<section class="slide"><p>\u{F8FF}</p><img src="a.png"></section>`);
    expect(scan.refs[0]).toMatchObject({ value: "a.png", line: 1, column: 42 });
  });

  test("lists every slide section, the first one being the one shown", () => {
    const scan = scanSlideHtml(`<section class="slide" data-layout="title" data-slug="a">
</section>
<section class="slide" data-layout="other"></section>`);
    expect(scan.slides.map((slide) => slide.line)).toEqual([1, 3]);
    expect(scan.layout).toBe("title");
    expect(scan.slug).toBe("a");
  });
});

describe("scanSlideHtml reads every attribute that names a URL", () => {
  test("media, frames, tracks, and objects load a resource; links are followed", () => {
    const scan = scanSlideHtml(`<section class="slide">
  <video src="assets/a.mp4" poster="assets/a.png"><source src="assets/b.webm"><track src="assets/a.vtt"></video>
  <audio src="assets/a.mp3"></audio>
  <iframe src="assets/a.html"></iframe>
  <object data="assets/a.svg"></object>
  <svg><image href="assets/c.png"/></svg>
  <a href="https://example.com">x</a>
</section>`);
    expect(scan.refs.map((ref) => [ref.tag, ref.attr, ref.value, ref.use])).toEqual([
      ["video", "src", "assets/a.mp4", "resource"],
      ["video", "poster", "assets/a.png", "resource"],
      ["source", "src", "assets/b.webm", "resource"],
      ["track", "src", "assets/a.vtt", "resource"],
      ["audio", "src", "assets/a.mp3", "resource"],
      ["iframe", "src", "assets/a.html", "resource"],
      ["object", "data", "assets/a.svg", "resource"],
      ["image", "href", "assets/c.png", "resource"],
      ["a", "href", "https://example.com", "link"],
    ]);
  });

  test("each srcset candidate is a reference of its own, located where it is written", () => {
    const scan = scanSlideHtml(
      `<img srcset="assets/a.png 1x, https://cdn.example.com/b.png 2x" src="assets/a.png">`,
    );
    expect(scan.refs.map((ref) => [ref.attr, ref.value, ref.column])).toEqual([
      ["srcset", "assets/a.png", 14],
      ["srcset", "https://cdn.example.com/b.png", 31],
      ["src", "assets/a.png", 70],
    ]);
  });
});

describe("srcsetUrls", () => {
  test.each([
    ["a.png", ["a.png"]],
    ["a.png 1x, b.png 2x", ["a.png", "b.png"]],
    ["a.png 480w,b.png 800w", ["a.png", "b.png"]],
    ["  a.png,  b.png 2x  ", ["a.png", "b.png"]],
    ["data:image/png;base64,AA 1x, b.png 2x", ["data:image/png;base64,AA", "b.png"]],
    ["", []],
  ])("%j", (value, urls) => {
    expect(srcsetUrls(value).map((candidate) => candidate.url)).toEqual(urls);
  });
});

// aria-hidden is how a slide marks decoration, and lint measures nothing under it; text there is
// text the audience may read and no check sees.
describe("scanSlideHtml finds text hidden from lint", () => {
  test.each<[string, [tag: string, text: string] | undefined]>([
    [
      '<svg aria-hidden="true"><text>試した技術</text><text>磨いた設計</text></svg>',
      ["svg", "試した技術 磨いた設計"],
    ],
    ['<div aria-hidden="true"><p>  a\n  sample </p></div>', ["div", "a sample"]],
    ['<div aria-hidden="true"><p aria-hidden="true">once</p></div>', ["div", "once"]],
    ['<div aria-hidden="true"><span></span><span></span></div>', undefined],
    [
      '<svg aria-hidden="true"><title>Loop</title><desc>A path</desc><path d="M0 0"/></svg>',
      undefined,
    ],
    ['<div aria-hidden="true">  </div>', undefined],
    ['<p aria-hidden="false">read</p>', undefined],
  ])("%s", (markup, hidden) => {
    const scan = scanSlideHtml(`<section class="slide">\n  ${markup}\n</section>`);
    expect(scan.hiddenTexts.map(({ element, text }) => [element.tag, element.line, text])).toEqual(
      hidden ? [[hidden[0], 2, hidden[1]]] : [],
    );
  });
});

describe("scanSlideHtml finds empty headings", () => {
  test.each([
    ['<h2 class="slide-title"></h2>', true],
    ["<h2>  \n </h2>", true],
    ["<h3><span></span></h3>", true],
    ["<h2>Title</h2>", false],
    ["<h2><span>Title</span></h2>", false],
    ['<h2><img src="assets/logo.png" alt="dek"></h2>', false],
    ['<h2 aria-label="Title"></h2>', false],
  ])("%s", (heading, empty) => {
    const scan = scanSlideHtml(`<section class="slide">\n  ${heading}\n</section>`);
    expect(scan.emptyHeadings.map((element) => [element.tag, element.line])).toEqual(
      empty ? [[heading.slice(1, 3), 2]] : [],
    );
  });
});
