import { describe, expect, test } from "bun:test";
import {
  DEK_KEYS,
  lockText,
  manifestChanges,
  type PluginManifest,
  pluginNameProblem,
  pluginsSection,
  readLock,
  readManifest,
  rulePrefix,
} from "../../src/core/plugin.ts";

const described = {
  schema: 1,
  name: "study",
  version: "0.1.0",
  check: {
    protocol: 1,
    rules: {
      STUDY001: { severity: "error", summary: "a sticker's text is not on its slide" },
      STUDY002: { severity: "warning", summary: "a hidden word shows elsewhere on the slide" },
    },
  },
  network: { hosts: ["example.com"] },
  data: [{ path: "study.yaml", public: true }],
};

const manifest: PluginManifest = {
  schema: 1,
  name: "study",
  version: "0.1.0",
  check: {
    protocol: 1,
    rules: {
      STUDY001: { severity: "error", summary: "a sticker's text is not on its slide" },
      STUDY002: { severity: "warning", summary: "a hidden word shows elsewhere on the slide" },
    },
  },
  data: [{ path: "study.yaml" }],
};

function reason(value: unknown, name = "study"): string {
  const reading = readManifest(value, name);
  if (reading.ok) {
    throw new Error("expected a refusal");
  }
  return reading.reason;
}

describe("pluginNameProblem", () => {
  test("takes a lowercase word, with digits and hyphens after its first letter", () => {
    expect(pluginNameProblem("study")).toBeUndefined();
    expect(pluginNameProblem("acme-talks2")).toBeUndefined();
  });

  test("refuses a name that is no plain lowercase word", () => {
    for (const name of ["Study", "2study", "study_x", "-study", "", "s".repeat(41)]) {
      expect(pluginNameProblem(name)).toBeDefined();
    }
  });

  test("refuses the names whose rule ids dek and rumdl already use", () => {
    expect(pluginNameProblem("dek")).toContain("DEK");
    expect(pluginNameProblem("md")).toContain("MD");
  });
});

test("a rule id's prefix is the name in capitals, with _ for -", () => {
  expect(rulePrefix("study")).toBe("STUDY");
  expect(rulePrefix("acme-talks")).toBe("ACME_TALKS");
});

describe("readManifest", () => {
  test("keeps only what this dek reads: a field it does not know is left out", () => {
    expect(readManifest(described, "study")).toEqual({ ok: true, manifest });
  });

  test("takes a plugin with no check and no data", () => {
    expect(readManifest({ schema: 1, name: "study", version: "1.0.0" }, "study")).toEqual({
      ok: true,
      manifest: { schema: 1, name: "study", version: "1.0.0" },
    });
  });

  test("refuses a manifest that names another plugin", () => {
    expect(reason({ ...described, name: "other" })).toContain("study");
  });

  test("says a schema or a protocol it does not know is newer than this dek", () => {
    const schema = readManifest({ ...described, schema: 2 }, "study");
    expect(schema).toMatchObject({ ok: false, unsupported: true });
    const protocol = readManifest(
      { ...described, check: { ...described.check, protocol: 2 } },
      "study",
    );
    expect(protocol).toMatchObject({ ok: false, unsupported: true });
  });

  test("calls a missing or malformed version malformed, not newer, since no dek reads it", () => {
    const { schema: _, ...unversioned } = described;
    for (const manifest of [
      {},
      unversioned,
      { ...described, schema: "1" },
      { ...described, schema: 0 },
      { ...described, schema: 1.5 },
      { ...described, check: { ...described.check, protocol: 0 } },
      { ...described, page: {} },
    ]) {
      const reading = readManifest(manifest, "study");
      expect(reading.ok).toBe(false);
      expect(reading).not.toHaveProperty("unsupported");
    }
  });

  test("refuses a rule id that does not start with the plugin's prefix and three digits", () => {
    for (const id of ["DEK001", "STUDY1", "STUDY0001", "study001", "OTHER001"]) {
      const rules = { [id]: { severity: "error", summary: "x" } };
      expect(reason({ ...described, check: { protocol: 1, rules } })).toContain("STUDY");
    }
    const hyphened = { ACME_TALKS001: { severity: "error", summary: "x" } };
    expect(
      readManifest(
        {
          schema: 1,
          name: "acme-talks",
          version: "1.0.0",
          check: { protocol: 1, rules: hyphened },
        },
        "acme-talks",
      ).ok,
    ).toBe(true);
  });

  test("refuses a severity other than error or warning", () => {
    const rules = { STUDY001: { severity: "note", summary: "x" } };
    expect(reason({ ...described, check: { protocol: 1, rules } })).toContain("STUDY001");
  });

  test("refuses a summary that is more than one short line", () => {
    for (const summary of ["two\nlines", "x".repeat(121), "", "tab\there"]) {
      const rules = { STUDY001: { severity: "error", summary } };
      expect(reason({ ...described, check: { protocol: 1, rules } })).toContain("summary");
    }
  });

  test("refuses a version that is not one plain token", () => {
    for (const version of ["", "1.0 beta", "v".repeat(65), "1.0\n"]) {
      expect(reason({ ...described, version })).toContain("version");
    }
  });

  test("refuses a data file outside the deck, hidden, or one of dek's own", () => {
    for (const path of [
      "../x.yaml",
      "/etc/passwd",
      "a/../b.yaml",
      "a\\b.yaml",
      ".study.yaml",
      "notes/.cache/x",
      "script.md",
      "theme.css",
      "slides/x.yaml",
      "assets/x.yaml",
      "voice/x.yaml",
      "dist/x.yaml",
      // A Mac's disk does not tell these from dek's own.
      "Slides/x.yaml",
      "SCRIPT.md",
      "Assets/x.yaml",
      "",
      "a//b",
    ]) {
      expect(reason({ ...described, data: [{ path }] })).toContain("data");
    }
    expect(readManifest({ ...described, data: [{ path: "study/cards.yaml" }] }, "study").ok).toBe(
      true,
    );
  });

  test("refuses a data file named twice", () => {
    const data = [{ path: "study.yaml" }, { path: "study.yaml" }];
    expect(reason({ ...described, data })).toContain("study.yaml");
  });

  test("refuses what is not a manifest at all", () => {
    expect(reason(null)).toBeDefined();
    expect(reason("study")).toBeDefined();
  });
});

describe("the lock", () => {
  test("reads back the manifest it was written from", () => {
    expect(readLock(lockText(manifest), "study")).toEqual({ ok: true, manifest });
  });

  test("is written the same whatever order the plugin printed its keys in", () => {
    const reordered = readManifest(
      { data: described.data, check: described.check, version: "0.1.0", name: "study", schema: 1 },
      "study",
    );
    if (!reordered.ok) {
      throw new Error(reordered.reason);
    }
    expect(lockText(reordered.manifest)).toBe(lockText(manifest));
  });

  test("ignores a field a newer dek wrote, as the manifest does", () => {
    const newer = JSON.stringify({ accepted: described, sha256: { page: "0".repeat(64) } });
    expect(readLock(newer, "study")).toEqual({ ok: true, manifest });
  });

  test("is no lock when it is not JSON dek wrote", () => {
    expect(readLock("{", "study").ok).toBe(false);
    expect(readLock("{}", "study").ok).toBe(false);
  });
});

describe("manifestChanges", () => {
  test("is empty for the same manifest", () => {
    expect(manifestChanges(manifest, structuredClone(manifest))).toEqual([]);
  });

  test("names each change in dek's words", () => {
    const installed: PluginManifest = {
      ...manifest,
      version: "0.2.0",
      check: {
        protocol: 1,
        rules: {
          STUDY001: { severity: "warning", summary: "a sticker's text is not on its slide" },
          STUDY003: { severity: "error", summary: "new" },
        },
      },
      data: [{ path: "cards.yaml" }],
    };
    expect(manifestChanges(manifest, installed)).toEqual([
      "version 0.1.0 → 0.2.0",
      "STUDY001 error → warning",
      "STUDY002 removed",
      "STUDY003 added (error)",
      "data study.yaml removed",
      "data cards.yaml added",
    ]);
  });

  test("names a summary that changed, and a check that came or went", () => {
    const reworded: PluginManifest = {
      ...manifest,
      check: {
        protocol: 1,
        rules: { ...manifest.check?.rules, STUDY002: { severity: "warning", summary: "other" } },
      },
    };
    expect(manifestChanges(manifest, reworded)).toEqual(["STUDY002 summary changed"]);
    const { check: _check, ...unchecked } = manifest;
    expect(manifestChanges(manifest, unchecked)).toEqual(["check removed"]);
    expect(manifestChanges(unchecked, manifest)).toEqual([
      "check added: STUDY001 (error), STUDY002 (warning)",
    ]);
  });
});

describe("pluginsSection", () => {
  test("lists each plugin as dek's facts, never the plugin's own words", () => {
    const section = pluginsSection([
      { name: "study", manifest },
      { name: "glossary", manifest: undefined },
    ]);
    expect(section).toContain(
      "- `study` 0.1.0: It checks STUDY001 and STUDY002. Its data: `study.yaml`.",
    );
    expect(section).toContain("- `glossary`: not pinned yet; `dekc sync` pins it.");
    expect(section).not.toContain("sticker");
  });

  test("shows a run of rules as a range", () => {
    const rules = Object.fromEntries(
      ["STUDY001", "STUDY002", "STUDY003"].map((id) => [id, { severity: "error", summary: "x" }]),
    ) as NonNullable<PluginManifest["check"]>["rules"];
    const section = pluginsSection([
      {
        name: "study",
        manifest: { schema: 1, name: "study", version: "1.0.0", check: { protocol: 1, rules } },
      },
    ]);
    expect(section).toContain("It checks STUDY001 to STUDY003.");
  });

  test("is empty when dek.toml names no plugin", () => {
    expect(pluginsSection([])).toBe("");
  });
});

describe("a manifest's page", () => {
  const paged = (page: unknown) => ({ ...described, page });

  test("keeps the page API version and the keys, sorted, and never the script", () => {
    const reading = readManifest(paged({ api: 1, keys: ["t", "r"], script: "x" }), "study");
    expect(reading.ok && reading.manifest.page).toEqual({ api: 1, keys: ["r", "t"] });
  });

  test("says a page API it does not know needs a newer dek", () => {
    expect(readManifest(paged({ api: 2, keys: [] }), "study")).toMatchObject({
      ok: false,
      unsupported: true,
    });
  });

  test("refuses a key dek binds, a key that is no single letter, and a key named twice", () => {
    for (const key of DEK_KEYS) {
      expect(reason(paged({ api: 1, keys: [key] }))).toContain(`\`${key}\``);
    }
    for (const keys of [["R"], ["rr"], ["1"], ["r", "r"]]) {
      expect(reason(paged({ api: 1, keys }))).toContain("page.keys");
    }
  });

  test("names a page added, removed, or with other keys as a change", () => {
    const withPage = { ...manifest, page: { api: 1 as const, keys: ["r"] } };
    expect(manifestChanges(manifest, withPage)).toEqual(["page added (keys r)"]);
    expect(manifestChanges(withPage, manifest)).toEqual(["page removed"]);
    expect(manifestChanges(withPage, { ...withPage, page: { api: 1, keys: ["r", "t"] } })).toEqual([
      "page keys r → r, t",
    ]);
  });

  test("lists its keys in AGENTS.md", () => {
    const section = pluginsSection([
      { name: "study", manifest: { ...manifest, page: { api: 1, keys: ["r"] } } },
    ]);
    expect(section).toContain("Its data: `study.yaml`. Its page takes the key `r`.");
  });
});

describe("a manifest's project data", () => {
  const both = [{ path: "words.yaml", in: "project" }, { path: "words.yaml" }];
  const words: PluginManifest = {
    schema: 1,
    name: "words",
    version: "0.1.0",
    data: [{ path: "words.yaml", in: "project" }, { path: "words.yaml" }],
  };

  test("keeps `in`, and takes one file name at both levels", () => {
    const reading = readManifest(
      { schema: 1, name: "words", version: "0.1.0", data: both },
      "words",
    );
    expect(reading).toEqual({ ok: true, manifest: words });
    expect(readLock(lockText(words), "words")).toEqual({ ok: true, manifest: words });
  });

  test("refuses a project file outside plugins/<name>/, hidden, or the lock", () => {
    for (const path of ["../x.yaml", "/x.yaml", "a/../b", ".words.yaml", "plugin.json", ""]) {
      expect(reason({ ...described, data: [{ path, in: "project" }] })).toContain("data");
    }
    // dek's deck files are not in plugins/<name>/, so their names are free there.
    expect(
      readManifest({ ...described, data: [{ path: "slides/x.yaml", in: "project" }] }, "study").ok,
    ).toBe(true);
  });

  test("refuses an `in` other than project, and a project file named twice", () => {
    expect(reason({ ...described, data: [{ path: "x.yaml", in: "deck" }] })).toContain("in");
    const twice = [
      { path: "x.yaml", in: "project" },
      { path: "x.yaml", in: "project" },
    ];
    expect(reason({ ...described, data: twice })).toContain("x.yaml");
  });

  test("names a project file by its path in the project", () => {
    expect(manifestChanges({ ...words, data: [{ path: "words.yaml" }] }, words)).toEqual([
      "data plugins/words/words.yaml added",
    ]);
    expect(pluginsSection([{ name: "words", manifest: words }])).toContain(
      "- `words` 0.1.0: Its data: `plugins/words/words.yaml`, `words.yaml`.",
    );
  });

  test("an older dek drops `in` and reads the file named twice, so the lock does not read", () => {
    const older = JSON.parse(lockText(words)) as { accepted: { data: Array<{ in?: string }> } };
    for (const entry of older.accepted.data) {
      delete entry.in;
    }
    const reading = readLock(JSON.stringify(older), "words");
    expect(reading.ok === false && reading.reason).toContain("`words.yaml` is named twice");
  });
});

test("DEK_KEYS is every letter the player binds", async () => {
  const { Glob } = await import("bun");
  const bound = new Set<string>();
  for await (const file of new Glob("src/runtime/*.ts").scan(".")) {
    const source = await Bun.file(file).text();
    for (const [, key] of source.matchAll(/isLetterKey\(\w+, "([a-z])"\)/g)) {
      bound.add(key as string);
    }
  }
  expect([...bound].sort()).toEqual([...DEK_KEYS].sort());
});
