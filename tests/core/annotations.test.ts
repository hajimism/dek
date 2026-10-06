import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  annotationsPath,
  applyAnnotationOp,
  clearAnnotations,
  listAnnotations,
} from "../../src/core/annotations.ts";
import { DekError } from "../../src/core/error.ts";
import { resolveDeck } from "../../src/core/resolve.ts";
import { type ProjectSpec, withTempProject } from "../helpers/project.ts";

const script = `---
title: Plan
lang: en
---

## cover

hi

## plan

### base {#base}

one
`;

// The section is on line 1, the lane on 2, the chevron on 3 with its <b> at column 29, the arrow on 4.
const plan = `<section class="slide">
  <div class="lane">
    <div class="chevron">画面 <b>設計</b></div>
    <div class="arrow"></div>
  </div>
</section>
`;

const spec: ProjectSpec = {
  decks: [
    {
      name: "plan",
      script,
      slides: { cover: `<section class="slide"><h2>cover</h2></section>\n`, plan },
    },
    { name: "other", script, slides: { plan } },
  ],
};

const NOW = new Date("2026-10-06T10:00:00.000Z");
const box = { x: 10, y: 20, width: 30, height: 40 };

function deckIn(root: string, name = "plan") {
  return resolveDeck(join(root, "decks", name)).deck;
}

function add(root: string, op: { slug?: string; step?: string; text?: string; sources: string[] }) {
  return applyAnnotationOp(
    root,
    deckIn(root),
    {
      op: "add",
      slug: op.slug ?? "plan",
      step: op.step ?? "base",
      text: op.text ?? "",
      targets: op.sources.map((source) => ({ source, box })),
    },
    NOW,
  );
}

const slidePath = (root: string, slug = "plan", ext = ".html") =>
  join(root, "decks", "plan", "slides", `${slug}${ext}`);

describe("annotations", () => {
  test("keeps a note in .dek/annotations.json, naming each element as the file writes it", async () => {
    await withTempProject(spec, async (root) => {
      const { annotations } = add(root, { sources: ["3:5", "4:5"], text: "make the arrow pink" });
      expect(existsSync(annotationsPath(root))).toBe(true);
      expect(annotations).toEqual([
        {
          number: 1,
          id: expect.any(String),
          slug: "plan",
          step: "base",
          status: "open",
          text: "make the arrow pink",
          targets: [
            {
              path: slidePath(root),
              line: 3,
              column: 5,
              found: true,
              name: "div.chevron",
              was: "画面 設計",
              text: "画面 設計",
              box,
            },
            {
              path: slidePath(root),
              line: 4,
              column: 5,
              found: true,
              name: "div.arrow",
              was: "",
              text: "",
              box,
            },
          ],
          changed: [],
          shot: "dekc shot plan plan --step base",
          createdAt: NOW.toISOString(),
        },
      ]);
      expect(listAnnotations(root, deckIn(root))).toEqual(annotations);
    });
  });

  test("names the slide itself by the point clicked on it", async () => {
    await withTempProject(spec, async (root) => {
      const { annotations } = applyAnnotationOp(root, deckIn(root), {
        op: "add",
        slug: "plan",
        step: "0",
        text: "too empty here",
        targets: [{ source: "1:1", box, point: { x: 5, y: 6 } }],
      });
      expect(annotations[0]?.targets[0]).toMatchObject({
        name: "section.slide",
        was: "",
        point: { x: 5, y: 6 },
      });
      expect(annotations[0]?.shot).toBe("dekc shot plan plan --step 0");
    });
  });

  test("numbers the notes in talk order, then as they were written", async () => {
    await withTempProject(spec, async (root) => {
      add(root, { sources: ["4:5"], step: "base", text: "second" });
      add(root, { sources: ["3:5"], step: "0", text: "first" });
      add(root, { slug: "cover", sources: ["1:24"], step: "0", text: "zeroth" });
      expect(listAnnotations(root, deckIn(root)).map((row) => [row.number, row.text])).toEqual([
        [1, "zeroth"],
        [2, "first"],
        [3, "second"],
      ]);
    });
  });

  test("takes no element the file does not have, so a stale page cannot write a wrong line", async () => {
    await withTempProject(spec, async (root) => {
      expect(() => add(root, { sources: ["9:9"] })).toThrow(DekError);
      expect(() => add(root, { slug: "nope", sources: ["1:1"] })).toThrow(DekError);
      expect(() => add(root, { step: "nope", sources: ["1:1"] })).toThrow(DekError);
      expect(existsSync(annotationsPath(root))).toBe(false);
    });
  });

  test("follows an element an edit moved, and says the slide changed", async () => {
    await withTempProject(spec, async (root) => {
      add(root, { sources: ["4:5"] });
      await writeFile(
        slidePath(root),
        plan.replace('  <div class="lane">', '  <p>new</p>\n  <div class="lane">'),
      );
      const [row] = listAnnotations(root, deckIn(root));
      expect(row?.status).toBe("edited");
      expect(row?.changed).toEqual([slidePath(root)]);
      expect(row?.targets[0]).toMatchObject({ line: 5, column: 5, found: true, name: "div.arrow" });
    });
  });

  test("shows an element's words rewritten where it stands, beside what they were", async () => {
    await withTempProject(spec, async (root) => {
      add(root, { sources: ["3:5"] });
      await writeFile(slidePath(root), plan.replace("画面 <b>設計</b>", "画面 <b>実装</b>"));
      const [row] = listAnnotations(root, deckIn(root));
      expect(row?.status).toBe("edited");
      expect(row?.targets[0]).toMatchObject({
        line: 3,
        found: true,
        was: "画面 設計",
        text: "画面 実装",
      });
    });
  });

  test("follows an element an agent gave another class, and names it as it is now", async () => {
    await withTempProject(spec, async (root) => {
      add(root, { sources: ["3:5"] });
      await writeFile(slidePath(root), plan.replace('class="chevron"', 'class="chevron is-now"'));
      expect(listAnnotations(root, deckIn(root))[0]?.targets[0]).toMatchObject({
        line: 3,
        found: true,
        name: "div.chevron.is-now",
        was: "画面 設計",
      });
    });
  });

  test("counts a change to the slide's own stylesheet or script, and nothing outside the slide", async () => {
    await withTempProject(spec, async (root) => {
      add(root, { sources: ["4:5"] });
      await writeFile(join(root, "decks", "plan", "theme.css"), ".slide { --fg: red; }\n");
      expect(listAnnotations(root, deckIn(root))[0]?.status).toBe("open");
      await writeFile(slidePath(root, "plan", ".css"), ".arrow { color: var(--accent); }\n");
      const [row] = listAnnotations(root, deckIn(root));
      expect(row?.status).toBe("edited");
      expect(row?.changed).toEqual([slidePath(root, "plan", ".css")]);
    });
  });

  test("keeps following through edits, from where each list last found it", async () => {
    await withTempProject(spec, async (root) => {
      add(root, { sources: ["3:5"] });
      await writeFile(slidePath(root), plan.replace("画面 <b>設計</b>", "画面 <b>実装</b>"));
      listAnnotations(root, deckIn(root));
      // Moved as well as rewritten since the note: only the step between the two lists is seen.
      await writeFile(
        slidePath(root),
        plan
          .replace("画面 <b>設計</b>", "画面 <b>実装</b>")
          .replace('<section class="slide">', '<section class="slide">\n  <p>new</p>'),
      );
      expect(listAnnotations(root, deckIn(root))[0]?.targets[0]).toMatchObject({
        line: 4,
        found: true,
        was: "画面 設計",
        text: "画面 実装",
      });
    });
  });

  test("is gone once none of its elements is on the slide, and keeps where they were", async () => {
    await withTempProject(spec, async (root) => {
      add(root, { sources: ["4:5"] });
      await writeFile(slidePath(root), plan.replace('    <div class="arrow"></div>\n', ""));
      const [row] = listAnnotations(root, deckIn(root));
      expect(row?.status).toBe("gone");
      expect(row?.targets[0]).toMatchObject({ line: 4, column: 5, found: false, text: null });
    });
  });

  test("is gone with its slide", async () => {
    await withTempProject(spec, async (root) => {
      add(root, { sources: ["4:5"] });
      await rm(slidePath(root));
      expect(listAnnotations(root, deckIn(root))[0]?.status).toBe("gone");
      await writeFile(
        join(root, "decks", "plan", "script.md"),
        script.replace(/## plan[\s\S]*/, ""),
      );
      await writeFile(slidePath(root), plan);
      expect(listAnnotations(root, deckIn(root))[0]?.status).toBe("gone");
    });
  });

  test("edits a note's words, removes one, and clears the deck's while keeping other decks'", async () => {
    await withTempProject(spec, async (root) => {
      const first = add(root, { sources: ["3:5"], text: "a" }).annotations[0];
      add(root, { sources: ["4:5"], text: "b" });
      applyAnnotationOp(root, deckIn(root, "other"), {
        op: "add",
        slug: "plan",
        step: "0",
        text: "elsewhere",
        targets: [{ source: "1:1", box }],
      });
      const id = first?.id ?? "";
      expect(
        applyAnnotationOp(root, deckIn(root), { op: "edit", id, text: "c" }).annotations.map(
          (row) => row.text,
        ),
      ).toEqual(["c", "b"]);
      expect(
        applyAnnotationOp(root, deckIn(root), { op: "remove", id }).annotations.map(
          (row) => row.text,
        ),
      ).toEqual(["b"]);
      expect(() => applyAnnotationOp(root, deckIn(root), { op: "remove", id })).toThrow(DekError);
      expect(clearAnnotations(root, deckIn(root))).toBe(1);
      expect(listAnnotations(root, deckIn(root))).toEqual([]);
      expect(listAnnotations(root, deckIn(root, "other")).map((row) => row.text)).toEqual([
        "elsewhere",
      ]);
    });
  });

  test("hands back what a clear took, to put back as it was", async () => {
    await withTempProject(spec, async (root) => {
      const before = add(root, { sources: ["3:5"], text: "a" }).annotations;
      const cleared = applyAnnotationOp(root, deckIn(root), { op: "clear" });
      expect(cleared.annotations).toEqual([]);
      expect(cleared.removed).toHaveLength(1);
      const restored = applyAnnotationOp(root, deckIn(root), {
        op: "restore",
        annotations: cleared.removed ?? [],
      });
      expect(restored.annotations).toEqual(before);
    });
  });

  test("says how to start over from a file it cannot read", async () => {
    await withTempProject(spec, async (root) => {
      add(root, { sources: ["3:5"] });
      await writeFile(annotationsPath(root), "{ nope");
      let error: unknown;
      try {
        listAnnotations(root, deckIn(root));
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(DekError);
      expect((error as DekError).hint).toContain("delete .dek/annotations.json");
      expect(await readFile(annotationsPath(root), "utf8")).toBe("{ nope");
    });
  });
});
