import { describe, expect, spyOn, test } from "bun:test";
import { displayPaths, formatText, writeSuccess } from "../../src/cli/result.ts";
import type { Diagnostic } from "../../src/core/diagnostic.ts";

describe("formatText", () => {
  test("formats init and new with the commands to run next", () => {
    expect(
      formatText({
        command: "init",
        data: {
          root: "/tmp/talks",
          created: ["dek.toml"],
          kept: [],
          next: ["cd talks", "bunx dek new <name>"],
        },
      }),
    ).toBe("created project at /tmp/talks\n  dek.toml\n\nnext:\n  cd talks\n  bunx dek new <name>");
    expect(
      formatText({
        command: "new",
        data: { name: "demo", dir: "/tmp/demo", created: [], next: ["cd decks/demo"] },
      }),
    ).toBe("created deck demo\n\nnext:\n  cd decks/demo");
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
              diagnostics: [{ id: "DEK001", severity: "error", message: "missing" }],
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
              diagnostics: [{ id: "DEK001", severity: "error", message: "missing" }],
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
          diagnostics: [{ id: "DEK001", severity: "error", message: "missing" }],
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

  test("formats show with a labeled part per file", () => {
    const base = {
      slug: "intro",
      title: "intro",
      script: "hello",
      html: null,
      css: null,
      ts: null,
      theme: null,
      assets: [],
    };
    expect(formatText({ command: "show", data: base })).toBe("--- script.md\nhello");
    expect(
      formatText({
        command: "show",
        data: { ...base, html: "<section></section>\n", assets: ["assets/a.png"] },
      }),
    ).toBe(
      "--- script.md\nhello\n\n--- slides/intro.html\n<section></section>\n\n--- assets\nassets/a.png",
    );
  });

  test("formats build as a wrote line", () => {
    expect(
      formatText({
        command: "build",
        data: {
          outs: ["/tmp/dist/demo.html"],
          images: ["/tmp/dist/demo.png"],
          notes: [],
          diagnostics: [],
        },
      }),
    ).toBe("wrote /tmp/dist/demo.html\nwrote /tmp/dist/demo.png");
    expect(
      formatText({
        command: "build",
        data: {
          outs: ["/tmp/dist/a.html", "/tmp/dist/b.html"],
          images: [],
          notes: [],
          diagnostics: [],
        },
      }),
    ).toBe("wrote /tmp/dist/a.html\nwrote /tmp/dist/b.html");
  });

  test("formats sync with created files", () => {
    expect(
      formatText({
        command: "sync",
        data: { created: ["/tmp/decks/demo/slides/extra.html"], updated: [], removed: [] },
      }),
    ).toBe("synced 1 file\n  /tmp/decks/demo/slides/extra.html");
    expect(formatText({ command: "sync", data: { created: [], updated: [], removed: [] } })).toBe(
      "synced 0 files",
    );
    expect(
      formatText({
        command: "sync",
        data: { created: ["/d/slides/extra.html"], updated: ["/d/slides/intro.html"], removed: [] },
      }),
    ).toBe("synced 2 files\n  /d/slides/extra.html\n  /d/slides/intro.html (updated)");
    expect(
      formatText({
        command: "sync",
        data: { created: ["/d/slides/mine.html"], updated: [], removed: ["/d/slides/next.html"] },
      }),
    ).toBe("synced 2 files\n  /d/slides/mine.html\n  /d/slides/next.html (removed)");
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

describe("formatText check", () => {
  test("says why visual was skipped and how to turn it on", () => {
    expect(
      formatText({
        command: "check",
        data: {
          slug: "intro",
          diagnostics: [],
          skipped: [{ check: "visual", reason: "Playwright is not installed", hint: "install it" }],
        },
      }),
    ).toBe("no diagnostics\nvisual: skipped (Playwright is not installed)\n  help: install it");
  });

  test("names every skipped check, with or without a hint", () => {
    expect(
      formatText({
        command: "check",
        data: {
          slug: "intro",
          diagnostics: [],
          skipped: [
            { check: "visual", reason: "Playwright is not installed", hint: "install it" },
            { check: "voice", reason: "the deck has no voice/voice.toml", hint: "write it" },
          ],
        },
      }),
    ).toBe(
      [
        "no diagnostics",
        "visual: skipped (Playwright is not installed)",
        "  help: install it",
        "voice: skipped (the deck has no voice/voice.toml)",
        "  help: write it",
      ].join("\n"),
    );
  });
});

describe("displayPaths", () => {
  test("prints diagnostic paths relative to the working directory", () => {
    const result = displayPaths(
      {
        command: "check",
        data: {
          slug: "intro",
          diagnostics: [
            {
              id: "DEK011",
              severity: "error",
              message: "style",
              path: "/p/decks/demo/slides/intro.html",
            },
            { id: "DEK012", severity: "error", message: "raw", path: "/p/theme.css" },
            { id: "DEK099", severity: "error", message: "no path" },
          ],
          shot: "/p/decks/demo/.cache/shots/intro.png",
        },
      },
      "/p/decks/demo",
    );
    expect(result.command === "check" && result.data.diagnostics.map((d) => d.path)).toEqual([
      "slides/intro.html",
      "../../theme.css",
      undefined,
    ]);
    expect(result.command === "check" && result.data.shot).toBe(
      "/p/decks/demo/.cache/shots/intro.png",
    );
  });

  test("covers lint, cues, and both ls shapes", () => {
    const diagnostics: Diagnostic[] = [
      { id: "DEK001", severity: "error", message: "missing", path: "/p/decks/demo/script.md" },
    ];
    const cwd = "/p";
    const lint = displayPaths({ command: "lint", data: { diagnostics } }, cwd);
    const cues = displayPaths(
      { command: "cues", data: { name: "demo", cues: [], diagnostics } },
      cwd,
    );
    const list = displayPaths(
      {
        command: "ls",
        data: {
          kind: "list",
          root: "/p",
          decks: [{ name: "demo", title: "Demo", sections: 1, slides: 1, diagnostics }],
          failed: [],
        },
      },
      cwd,
    );
    expect(lint.command === "lint" && lint.data.diagnostics[0]?.path).toBe("decks/demo/script.md");
    expect(cues.command === "cues" && cues.data.diagnostics[0]?.path).toBe("decks/demo/script.md");
    expect(
      list.command === "ls" &&
        list.data.kind === "list" &&
        list.data.decks[0]?.diagnostics[0]?.path,
    ).toBe("decks/demo/script.md");
    expect(diagnostics[0]?.path).toBe("/p/decks/demo/script.md");
  });
});

describe("displayPaths created files", () => {
  test("prints files dek created in the source tree relative to cwd", () => {
    const cwd = "/p/decks/demo";
    const sync = displayPaths(
      {
        command: "sync",
        data: {
          created: ["/p/decks/demo/slides/intro.html"],
          updated: ["/p/decks/demo/slides/cover.html"],
          removed: ["/p/decks/demo/slides/next.html"],
        },
      },
      cwd,
    );
    const created = displayPaths(
      {
        command: "new",
        data: {
          name: "next",
          dir: "/p/decks/next",
          created: ["/p/decks/next/script.md"],
          next: [],
        },
      },
      "/p",
    );
    expect(sync.command === "sync" && sync.data).toEqual({
      created: ["slides/intro.html"],
      updated: ["slides/cover.html"],
      removed: ["slides/next.html"],
    });
    expect(created.command === "new" && created.data.created).toEqual(["decks/next/script.md"]);
  });
});

describe("writeSuccess", () => {
  test("a failing lint sets the exit code and never calls process.exit, so piped output is not cut", () => {
    const written: string[] = [];
    const write = spyOn(process.stdout, "write").mockImplementation((chunk) => {
      written.push(String(chunk));
      return true;
    });
    const exit = spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit was called");
    }) as never);
    const previous = process.exitCode;
    try {
      writeSuccess(
        {
          command: "lint",
          data: { diagnostics: [{ id: "DEK001", severity: "error", message: "missing" }] },
        },
        { json: true },
      );
      expect(exit).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
      expect(JSON.parse(written.join(""))).toEqual({
        ok: false,
        error: {
          message: "lint found 1 error",
          hint: "fix each error in diagnostics, then run `dek lint` again",
        },
        diagnostics: [{ id: "DEK001", severity: "error", message: "missing" }],
      });
    } finally {
      process.exitCode = previous;
      write.mockRestore();
      exit.mockRestore();
    }
  });

  function captured(run: () => void): { stdout: string; stderr: string } {
    const out: string[] = [];
    const err: string[] = [];
    const stdout = spyOn(process.stdout, "write").mockImplementation((chunk) => {
      out.push(String(chunk));
      return true;
    });
    const stderr = spyOn(process.stderr, "write").mockImplementation((chunk) => {
      err.push(String(chunk));
      return true;
    });
    const previous = process.exitCode;
    try {
      run();
    } finally {
      process.exitCode = previous;
      stdout.mockRestore();
      stderr.mockRestore();
    }
    return { stdout: out.join(""), stderr: err.join("") };
  }

  test("a failing check carries error first, then its own fields", () => {
    const { stdout } = captured(() =>
      writeSuccess(
        {
          command: "check",
          data: {
            slug: "intro",
            diagnostics: [
              { id: "DEK030", severity: "error", message: "overflow" },
              { id: "DEK024", severity: "warning", message: "empty" },
            ],
          },
        },
        { json: true },
      ),
    );
    const json = JSON.parse(stdout);
    expect(Object.keys(json).slice(0, 3)).toEqual(["ok", "error", "slug"]);
    expect(json.error).toEqual({
      message: "check found 1 error and 1 warning",
      hint: "fix each error in diagnostics, then run `dek check intro` again",
    });
  });

  test("warnings alone pass, with no error", () => {
    const { stdout } = captured(() =>
      writeSuccess(
        {
          command: "lint",
          data: { diagnostics: [{ id: "DEK024", severity: "warning", message: "empty" }] },
        },
        { json: true },
      ),
    );
    expect(JSON.parse(stdout)).toEqual({
      ok: true,
      diagnostics: [{ id: "DEK024", severity: "warning", message: "empty" }],
    });
  });

  test("lint text names a skipped check, why, and how to run it", () => {
    const { stdout, stderr } = captured(() =>
      writeSuccess(
        {
          command: "lint",
          data: {
            diagnostics: [],
            skipped: [{ check: "rumdl", reason: "rumdl is not installed", hint: "install rumdl" }],
          },
        },
        { json: false },
      ),
    );
    expect(stdout).toBe("no diagnostics\n");
    expect(stderr).toBe("rumdl: skipped (rumdl is not installed)\n  help: install rumdl\n");
  });

  test("SARIF output lists a skipped check as a tool execution notification", () => {
    const { stdout } = captured(() =>
      writeSuccess(
        {
          command: "lint",
          data: {
            diagnostics: [],
            skipped: [{ check: "rumdl", reason: "rumdl is not installed", hint: "install rumdl" }],
          },
        },
        { json: false, format: "sarif" },
      ),
    );
    const sarif = JSON.parse(stdout);
    expect(sarif.runs[0].invocations[0].toolExecutionNotifications[0].descriptor).toEqual({
      id: "skipped/rumdl",
    });
  });

  test("a clean result leaves the exit code alone", () => {
    const write = spyOn(process.stdout, "write").mockImplementation(() => true);
    const previous = process.exitCode;
    try {
      writeSuccess({ command: "lint", data: { diagnostics: [] } }, { json: true });
      expect(process.exitCode).toBe(previous);
    } finally {
      process.exitCode = previous;
      write.mockRestore();
    }
  });
});
