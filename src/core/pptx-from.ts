import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import type { Diagnostic, SkippedCheck } from "./diagnostic.ts";
import { DekError } from "./error.ts";
import { type DistOptions, distFile } from "./path.ts";
import { checkPptxJson } from "./pptx-check.ts";
import { type PptxJson, pptxFromJson, pptxJsonFiles, pptxJsonSchema } from "./pptx-json.ts";
import { pptxPackage } from "./pptx-package.ts";
import { deckSourceHash, PPTX_SPEC_DIR, PPTX_SPEC_FILE, type PptxSpec } from "./pptx-spec.ts";
import { asResolvedDeck, type ResolvedDeck } from "./resolve.ts";
import { followInside, writeInside } from "./safe-fs.ts";

// `dekc pptx --from <file>`: a PPTX as an agent built it again, from JSON in the shape
// deck.pptx.json has, written as `dekc pptx` writes its own and checked against the deck.

export type PptxFromResult = {
  outPath: string;
  diagnostics: Diagnostic[];
  /** The check, when the file was written unchecked: no spec.json, or one older than the deck. */
  skipped?: SkippedCheck[];
};

export function pptxFromFile(
  input: string | ResolvedDeck,
  file: string,
  options: DistOptions = {},
): PptxFromResult {
  const { project, deck } = asResolvedDeck(input);
  const path = isAbsolute(file) ? file : join(process.cwd(), file);
  const real = followInside(path, project.root);
  if (real === undefined || !existsSync(real)) {
    throw new DekError(`no file at ${file}`, {
      hint: "pass the JSON you edited from .cache/pptx/deck.pptx.json, which dekc pptx spec writes",
    });
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(real, "utf8"));
  } catch (error) {
    throw new DekError(`${file} is not JSON: ${(error as Error).message}`, { path: file });
  }
  const parsed = pptxJsonSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 5).map((issue) => {
      const at = issue.path.map((key) =>
        typeof key === "number" ? `[${key}]` : `.${String(key)}`,
      );
      return `${at.join("").replace(/^\./, "") || "(top)"}: ${issue.message}`;
    });
    throw new DekError(`${file} is not a PPTX as deck.pptx.json has it: ${issues.join("; ")}`, {
      path: file,
      hint: "fix what each names; a layer's fields are those deck.pptx.json uses",
    });
  }
  const json: PptxJson = parsed.data;
  const fromDeck = (name: string) => {
    const at = followInside(join(deck.dir, name), project.root);
    return at !== undefined && existsSync(at) ? at : undefined;
  };
  const missing = pptxJsonFiles(json).filter((each) => fromDeck(each.path) === undefined);
  if (missing.length > 0) {
    throw new DekError(
      `${file} names files that are not in the deck's folder: ${missing
        .slice(0, 5)
        .map((each) => `${each.where} ${each.path}`)
        .join("; ")}`,
      {
        path: file,
        hint: "name each by its path from the deck's folder; run dekc pptx spec again for its parts",
      },
    );
  }
  const read = (name: string) => readFileSync(fromDeck(name) as string);
  const bytes = pptxPackage(pptxFromJson(json, read, (name) => read(name).toString("utf8")));
  const outPath = distFile(project, deck, "pptx", options);
  writeInside(outPath, bytes, project.root);

  const specPath = join(deck.dir, PPTX_SPEC_DIR, PPTX_SPEC_FILE);
  if (!existsSync(specPath)) {
    return {
      outPath,
      diagnostics: [],
      skipped: [
        {
          check: "pptx",
          reason: "there is no spec.json to check it against",
          hint: "run `dekc pptx spec`, then this again",
        },
      ],
    };
  }
  const spec = JSON.parse(readFileSync(specPath, "utf8")) as PptxSpec;
  if (spec.source !== deckSourceHash(deck.dir)) {
    return {
      outPath,
      diagnostics: [],
      skipped: [
        {
          check: "pptx",
          reason: "spec.json is older than the deck's script, slides, or theme",
          hint: "run `dekc pptx spec` again, then this again",
        },
      ],
    };
  }
  return { outPath, diagnostics: checkPptxJson(json, spec) };
}
