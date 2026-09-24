import { describe, expect, test } from "bun:test";
import {
  agentHelpText,
  formatDevEvent,
  formatDiagnostics,
  formatError,
  formatErrorText,
  helpText,
  writeDevEvent,
} from "../../src/cli/format.ts";
import { DekError } from "../../src/core/error.ts";

describe("helpText", () => {
  test("lists core commands and --json", () => {
    const text = helpText();
    expect(text).toContain("init");
    expect(text).toContain("lint");
    expect(text).toContain("build");
    expect(text).toContain("--json");
    expect(text).toContain("Dev");
    expect(text).toContain("Project");
    expect(text).toContain("Slide");
    expect(text).toContain("CI");
    expect(text).toContain("dek help --agent");
    expect(text).toContain("--root-dist");
    expect(text).toContain(
      "Commands that print a result accept --json. dek and dek rehearse stay running.",
    );
    expect(text).not.toContain("All commands accept --json");
  });

  test("lists mv", () => {
    expect(helpText()).toContain("mv");
  });

  test("lists pdf", () => {
    expect(helpText()).toContain("pdf");
  });

  test("lists cues", () => {
    expect(helpText()).toContain("cues");
  });

  test("lists --remote on the dev server", () => {
    expect(helpText()).toContain("--remote");
  });

  test("lists rehearse", () => {
    expect(helpText()).toContain("rehearse");
  });

  test("lists video", () => {
    expect(helpText()).toContain("video");
  });

  test("lists voice pin", () => {
    expect(helpText()).toContain("voice pin");
  });
});

describe("agentHelpText", () => {
  test("covers agent commands and machine-readable output", () => {
    const text = agentHelpText();
    expect(text).toContain("check");
    expect(text).toContain("shot");
    expect(text).toContain("goto");
    expect(text).toContain("current");
    expect(text).toContain("--visual");
    expect(text).toContain("--json");
    expect(text).toContain("sarif");
    expect(text).toContain("pdf");
    expect(text).toContain("--remote");
    expect(text).toContain("pin");
    expect(text).toContain("--root-dist");
    expect(text).toContain("Result commands accept --json. dek / rehearse do not (long-running).");
    expect(text).toContain("only errors exit 1");
    expect(text).toContain("dek theme [layout]");
    expect(text).not.toContain("All commands accept --json");
    expect(text.split("\n").length).toBeLessThan(80);
    expect(text).not.toBe(helpText());
  });
});

describe("formatDiagnostics", () => {
  test("formats path, line, id, and message", () => {
    expect(
      formatDiagnostics([
        {
          id: "DEK001",
          message: 'missing slide HTML for "intro"',
          path: "script.md",
          line: 3,
        },
      ]),
    ).toBe('script.md:3: DEK001 missing slide HTML for "intro"');
  });

  test("formats path without a line", () => {
    expect(
      formatDiagnostics([
        {
          id: "DEK002",
          message: 'slide HTML has no section "orphan"',
          path: "slides/orphan.html",
        },
      ]),
    ).toBe('slides/orphan.html: DEK002 slide HTML has no section "orphan"');
  });

  test("formats a line without a path", () => {
    expect(formatDiagnostics([{ id: "DEK004", message: "duplicate id", line: 4 }])).toBe(
      "4: DEK004 duplicate id",
    );
  });

  test("prints a diagnostic hint under its line", () => {
    expect(
      formatDiagnostics([
        { id: "DEK003", message: 'data-step "3"', path: "slides/intro.html", hint: "use hook" },
        { id: "DEK011", message: "style attribute", path: "slides/intro.html" },
      ]),
    ).toBe(
      'slides/intro.html: DEK003 data-step "3"\n  help: use hook\nslides/intro.html: DEK011 style attribute',
    );
  });

  test("labels a warning after its rule id", () => {
    expect(
      formatDiagnostics([
        {
          id: "DEK040",
          message: "dictionary is missing English word: AI",
          path: "script.md",
          line: 9,
        },
      ]),
    ).toBe("script.md:9: DEK040 warning: dictionary is missing English word: AI");
  });

  test("returns no diagnostics for an empty list", () => {
    expect(formatDiagnostics([])).toBe("no diagnostics");
  });

  test("prints only the hints the diagnostics carry", () => {
    expect(
      formatDiagnostics([
        { id: "DEK001", message: 'missing slide HTML for "intro"', path: "script.md", line: 5 },
        { id: "DEK002", message: 'slide HTML has no section "orphan"', path: "slides/orphan.html" },
      ]),
    ).toBe(`script.md:5: DEK001 missing slide HTML for "intro"
slides/orphan.html: DEK002 slide HTML has no section "orphan"`);
  });
});

describe("formatError", () => {
  test("includes path, line, and hint", () => {
    const error = new DekError("not a dek project", {
      path: "/tmp/talks",
      hint: "run `dek init` first",
    });
    expect(formatError(error)).toEqual({
      message: "not a dek project",
      path: "/tmp/talks",
      hint: "run `dek init` first",
    });
  });
});

describe("formatErrorText", () => {
  test("uses rustc-lite error, location, and help lines", () => {
    const error = new DekError("not a dek project", {
      path: "/tmp/talks",
      hint: "run `dek init` first",
    });
    expect(formatErrorText(error)).toBe(`error: not a dek project
 --> /tmp/talks
  help: run \`dek init\` first`);
  });

  test("colors the error label when color is true", () => {
    const error = new DekError("not a dek project");
    const text = formatErrorText(error, { color: true });
    expect(text).toContain("\x1b[31m");
    expect(text).toContain("error:");
    expect(text).toContain("not a dek project");
  });
});

describe("formatDevEvent", () => {
  test("formats a slide reload as one line", () => {
    expect(formatDevEvent({ type: "reload-slide", slug: "intro" })).toBe("reload-slide intro");
    expect(formatDevEvent({ type: "reload-script", slugs: ["intro", "usb"] })).toBe(
      "reload-script intro, usb",
    );
  });

  test("formats a theme reload as one line", () => {
    expect(formatDevEvent({ type: "reload-theme" })).toBe("reload-theme");
  });

  test("formats a sync event like a successful sync", () => {
    expect(formatDevEvent({ type: "sync", created: ["/tmp/decks/demo/slides/extra.html"] })).toBe(
      `synced 1 file
  /tmp/decks/demo/slides/extra.html`,
    );
  });

  test("stays silent when diagnostics are clean", () => {
    expect(formatDevEvent({ type: "diagnostics", diagnostics: [] })).toBeNull();
  });

  test("formats diagnostics the same way as formatDiagnostics", () => {
    const diagnostics = [
      {
        id: "DEK001",
        message: 'missing slide HTML for "architecture"',
        path: "slides/architecture.html",
        line: 12,
      },
    ];
    expect(formatDevEvent({ type: "diagnostics", diagnostics })).toBe(
      formatDiagnostics(diagnostics),
    );
  });
});

describe("writeDevEvent", () => {
  test("writes formatted events to the stream", () => {
    const chunks: string[] = [];
    writeDevEvent({ type: "reload-slide", slug: "intro" }, { write: (s) => chunks.push(s) });
    expect(chunks).toEqual(["reload-slide intro\n"]);
  });

  test("prints diagnostic paths relative to cwd when one is given", () => {
    const chunks: string[] = [];
    writeDevEvent(
      {
        type: "diagnostics",
        diagnostics: [{ id: "DEK010", message: 'class "x"', path: "/p/decks/demo/slides/a.html" }],
      },
      { write: (s) => chunks.push(s) },
      { cwd: "/p/decks/demo" },
    );
    expect(chunks).toEqual(['slides/a.html: DEK010 class "x"\n']);
  });

  test("writes nothing for a clean diagnostics event", () => {
    const chunks: string[] = [];
    writeDevEvent({ type: "diagnostics", diagnostics: [] }, { write: (s) => chunks.push(s) });
    expect(chunks).toEqual([]);
  });
});

describe("formatError paths", () => {
  test("prints the error path relative to cwd when one is given", () => {
    const error = new DekError("section not found", { path: "/p/decks/demo/script.md" });
    expect(formatError(error, { cwd: "/p/decks/demo" }).path).toBe("script.md");
    expect(formatError(error).path).toBe("/p/decks/demo/script.md");
  });
});
