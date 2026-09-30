import { describe, expect, test } from "bun:test";
import {
  formatDevEvent,
  formatDiagnostics,
  formatError,
  formatErrorText,
  writeDevEvent,
} from "../../src/cli/format.ts";
import { formatInit, formatReport } from "../../src/cli/text.ts";
import { agentHelpText, helpText } from "../../src/cli/usage.ts";
import type { Diagnostic } from "../../src/core/diagnostic.ts";
import { DekError } from "../../src/core/error.ts";

describe("helpText", () => {
  test("lists core commands and --json", () => {
    const text = helpText();
    expect(text).toContain("init");
    expect(text).toContain("lint");
    expect(text).toContain("build");
    expect(text).toContain("--json");
    expect(text).toContain("Development");
    expect(text).toContain("Project");
    expect(text).toContain("Slide");
    expect(text).toContain("Output");
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

  test("names where each command's --json shape is published", () => {
    expect(agentHelpText()).toContain(
      "Each command's --json shape: https://hajimism.github.io/dek/cli.schema.json",
    );
  });
});

describe("formatDiagnostics", () => {
  test("formats path, line, id, and message", () => {
    expect(
      formatDiagnostics([
        {
          id: "DEK001",
          severity: "error",
          message: 'missing slide HTML for "intro"',
          path: "script.md",
          line: 3,
        },
      ]),
    ).toBe('script.md:3: DEK001 missing slide HTML for "intro"');
  });

  test("adds the column after the line, the way editors jump to it", () => {
    expect(
      formatDiagnostics([
        {
          id: "DEK011",
          severity: "error",
          message: "slide contains a style attribute",
          path: "slides/intro.html",
          line: 3,
          column: 27,
        },
      ]),
    ).toBe("slides/intro.html:3:27: DEK011 slide contains a style attribute");
  });

  test("formats path without a line", () => {
    expect(
      formatDiagnostics([
        {
          id: "DEK002",
          severity: "error",
          message: 'slide HTML has no section "orphan"',
          path: "slides/orphan.html",
        },
      ]),
    ).toBe('slides/orphan.html: DEK002 slide HTML has no section "orphan"');
  });

  test("formats a line without a path", () => {
    expect(
      formatDiagnostics([{ id: "DEK004", severity: "error", message: "duplicate id", line: 4 }]),
    ).toBe("4: DEK004 duplicate id");
  });

  test("prints a diagnostic hint under its line", () => {
    expect(
      formatDiagnostics([
        {
          id: "DEK003",
          severity: "error",
          message: 'data-step "3"',
          path: "slides/intro.html",
          hint: "use hook",
        },
        { id: "DEK011", severity: "error", message: "style attribute", path: "slides/intro.html" },
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
          severity: "warning",
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
        {
          id: "DEK001",
          severity: "error",
          message: 'missing slide HTML for "intro"',
          path: "script.md",
          line: 5,
        },
        {
          id: "DEK002",
          severity: "error",
          message: 'slide HTML has no section "orphan"',
          path: "slides/orphan.html",
        },
      ]),
    ).toBe(`script.md:5: DEK001 missing slide HTML for "intro"
slides/orphan.html: DEK002 slide HTML has no section "orphan"`);
  });
});

// An agent reads a command's last lines; the verdict has to be there, whatever it cut above it.
describe("formatReport", () => {
  const found = (id: string, severity: Diagnostic["severity"] = "error"): Diagnostic => ({
    id,
    severity,
    message: "found",
  });

  test("ends the list with how many errors and warnings, and of which rules, most first", () => {
    const report = formatReport([
      found("DEK014"),
      found("DEK033"),
      found("DEK029", "warning"),
      found("DEK033"),
    ]);
    expect(report.split("\n").at(-1)).toBe(
      "3 errors and 1 warning: DEK033 ×2, DEK014 ×1, DEK029 ×1",
    );
    expect(report.split("\n")).toHaveLength(5);
  });

  test("counts one in the singular, and names no errors when there are none", () => {
    expect(
      formatReport([found("DEK040", "warning")])
        .split("\n")
        .at(-1),
    ).toBe("1 warning: DEK040 ×1");
  });

  test("says no diagnostics when there are none", () => {
    expect(formatReport([])).toBe("no diagnostics");
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

  test("marks skeletons the dev server refreshed", () => {
    expect(
      formatDevEvent({ type: "sync", created: [], updated: ["/tmp/decks/demo/slides/intro.html"] }),
    ).toBe("synced 1 file\n  /tmp/decks/demo/slides/intro.html (updated)");
  });

  test("names the skeletons a sync removed next to the ones it created", () => {
    expect(
      formatDevEvent({ type: "sync", created: ["/d/slides/mine.html"], removed: ["next"] }),
    ).toBe("synced 2 files\n  /d/slides/mine.html\n  next (removed)");
  });

  test("stays silent when diagnostics are clean", () => {
    expect(formatDevEvent({ type: "diagnostics", diagnostics: [] })).toBeNull();
  });

  test("formats diagnostics the same way as formatDiagnostics", () => {
    const diagnostics: Diagnostic[] = [
      {
        id: "DEK001",
        severity: "error",
        message: 'missing slide HTML for "architecture"',
        path: "slides/architecture.html",
        line: 12,
      },
    ];
    expect(formatDevEvent({ type: "diagnostics", diagnostics })).toBe(
      formatDiagnostics(diagnostics),
    );
  });

  test("names the deck on each line that starts an entry, when serving several", () => {
    expect(formatDevEvent({ type: "reload-slide", slug: "intro" }, { deck: "talk" })).toBe(
      "[talk] reload-slide intro",
    );
    expect(
      formatDevEvent({ type: "sync", created: ["a.html"], removed: ["b"] }, { deck: "talk" }),
    ).toBe("[talk] synced 2 files\n  a.html\n  b (removed)");
    const diagnostics: Diagnostic[] = [
      { id: "DEK001", severity: "error", message: "one", hint: "fix one" },
      { id: "DEK002", severity: "error", message: "two" },
    ];
    expect(formatDevEvent({ type: "diagnostics", diagnostics }, { deck: "talk" })).toBe(
      "[talk] DEK001 one\n  help: fix one\n[talk] DEK002 two",
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
        diagnostics: [
          {
            id: "DEK010",
            severity: "error",
            message: 'class "x"',
            path: "/p/decks/demo/slides/a.html",
          },
        ],
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

describe("formatInit", () => {
  test("lists each file init wrote, and each it kept as it was", () => {
    expect(
      formatInit({
        root: "/tmp/talks",
        created: ["dek.toml"],
        updated: [],
        kept: ["AGENTS.md"],
        next: [],
      }),
    ).toBe("created project at /tmp/talks\n  dek.toml\n  AGENTS.md (kept)");
  });

  test("says so when every file was already there", () => {
    expect(
      formatInit({ root: "/tmp/talks", created: [], updated: [], kept: ["AGENTS.md"], next: [] }),
    ).toBe("project at /tmp/talks is already set up\n  AGENTS.md (kept)");
  });
});
