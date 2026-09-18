import { describe, expect, test } from "bun:test";
import { formatText } from "../../src/cli/result.ts";

describe("formatText", () => {
  test("formats init and new", () => {
    expect(formatText({ command: "init", data: { root: "/tmp/talks", created: [] } })).toBe(
      "created project at /tmp/talks",
    );
    expect(
      formatText({ command: "new", data: { name: "demo", dir: "/tmp/demo", created: [] } }),
    ).toBe("created deck demo");
  });

  test("formats ls list with section, slide, and diagnostic counts", () => {
    expect(
      formatText({
        command: "ls",
        data: {
          kind: "list",
          root: "/tmp",
          decks: [
            {
              name: "demo",
              title: "Demo",
              sections: 2,
              slides: 2,
              diagnostics: [{ id: "DEK001", message: "missing" }],
            },
          ],
          failed: [],
        },
      }),
    ).toBe(`NAME  TITLE  SECTIONS  SLIDES  DIAGNOSTICS
demo  Demo          2       2            1`);
  });

  test("aligns CJK titles in the deck list", () => {
    expect(
      formatText({
        command: "ls",
        data: {
          kind: "list",
          root: "/tmp",
          decks: [
            {
              name: "tokyo",
              title: "HTML スライドツールを作った話",
              sections: 2,
              slides: 1,
              diagnostics: [{ id: "DEK001", message: "missing" }],
            },
            {
              name: "demo",
              title: "Demo",
              sections: 1,
              slides: 1,
              diagnostics: [],
            },
          ],
          failed: [],
        },
      }),
    ).toBe(`NAME   TITLE                          SECTIONS  SLIDES  DIAGNOSTICS
tokyo  HTML スライドツールを作った話         2       1            1
demo   Demo                                  1       1            0`);
  });

  test("formats a deck with event, date, duration, estimates, and budgets", () => {
    expect(
      formatText({
        command: "ls",
        data: {
          kind: "deck",
          name: "demo",
          title: "Demo",
          event: "Tokyo Frontend Meetup #42",
          date: "2026-04-18",
          duration: "20m",
          estimateSeconds: 12,
          sections: [
            { slug: "intro", title: "intro", beats: 0, estimateSeconds: 1, budgetSeconds: 200 },
            {
              slug: "architecture",
              title: "architecture",
              beats: 1,
              estimateSeconds: 11,
              budgetSeconds: 1000,
            },
          ],
          diagnostics: [{ id: "DEK001", message: "missing" }],
        },
      }),
    ).toBe(`demo  Demo
event     Tokyo Frontend Meetup #42
date      2026-04-18
duration  20m
estimate  0:12

SLUG          TITLE         ESTIMATE  BUDGET
intro         intro             0:01    3:20
architecture  architecture      0:11   16:40

1 diagnostic`);
  });

  test("formats a deck with estimate only when duration is missing", () => {
    expect(
      formatText({
        command: "ls",
        data: {
          kind: "deck",
          name: "demo",
          title: "Demo",
          estimateSeconds: 12,
          sections: [
            { slug: "intro", title: "intro", beats: 0, estimateSeconds: 1 },
            { slug: "architecture", title: "architecture", beats: 1, estimateSeconds: 11 },
          ],
          diagnostics: [],
        },
      }),
    ).toBe(`demo  Demo
estimate  0:12

SLUG          TITLE         ESTIMATE
intro         intro             0:01
architecture  architecture      0:11

0 diagnostics`);
  });

  test("formats a deck with video duration next to the estimate", () => {
    expect(
      formatText({
        command: "ls",
        data: {
          kind: "deck",
          name: "demo",
          title: "Demo",
          estimateSeconds: 12,
          videoSeconds: 8,
          sections: [
            { slug: "intro", title: "intro", beats: 0, estimateSeconds: 1, videoSeconds: 3 },
            {
              slug: "architecture",
              title: "architecture",
              beats: 1,
              estimateSeconds: 11,
              videoSeconds: 5,
            },
          ],
          diagnostics: [],
        },
      }),
    ).toBe(`demo  Demo
estimate  0:12
video     0:08

SLUG          TITLE         ESTIMATE  VIDEO
intro         intro             0:01   0:03
architecture  architecture      0:11   0:05

0 diagnostics`);
  });

  test("formats show with optional html", () => {
    expect(
      formatText({
        command: "show",
        data: { slug: "intro", title: "intro", script: "hello", html: null },
      }),
    ).toBe("hello");
    expect(
      formatText({
        command: "show",
        data: { slug: "intro", title: "intro", script: "hello", html: "<section></section>" },
      }),
    ).toBe("hello\n\n<section></section>");
  });

  test("formats build as a wrote line", () => {
    expect(formatText({ command: "build", data: { out: "/tmp/dist/demo.html" } })).toBe(
      "wrote /tmp/dist/demo.html",
    );
    expect(
      formatText({
        command: "build",
        data: { outs: ["/tmp/dist/a.html", "/tmp/dist/b.html"] },
      }),
    ).toBe("wrote /tmp/dist/a.html\nwrote /tmp/dist/b.html");
  });

  test("formats sync with created files", () => {
    expect(
      formatText({
        command: "sync",
        data: { created: ["/tmp/decks/demo/slides/extra.html"] },
      }),
    ).toBe("synced 1 file\n  /tmp/decks/demo/slides/extra.html");
    expect(formatText({ command: "sync", data: { created: [] } })).toBe("synced 0 files");
  });

  test("formats mv rename and reorder", () => {
    expect(formatText({ command: "mv", data: { from: "problem", to: "the-problem" } })).toBe(
      "renamed problem -> the-problem",
    );
    expect(formatText({ command: "mv", data: { from: "intro", before: "architecture" } })).toBe(
      "moved intro before architecture",
    );
    expect(formatText({ command: "mv", data: { from: "intro", after: "architecture" } })).toBe(
      "moved intro after architecture",
    );
  });
});
