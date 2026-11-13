// Which file may import which. Void does not tell a `.server.ts` file from any other outside
// `pages/`, and its client build turns `void/db` and `void/storage` into empty objects, so a
// component that reached the database would build and then fail in the browser. These rules are
// what keeps the layers apart:
//
// - Only a `*.server.ts` file calls Void (`void/db`, `void/env`, `void/storage`, `void/auth`) or
//   imports another `*.server.ts`. Anything else may take row types from `@schema` with
//   `import type`, and nothing more.
// - `src/common/` knows no model. `src/shell/` knows `common` and the `person` model.
// - Models come in the order person, deck, comment: each may import the ones before it, and the
//   ones after it only from a feature.
// - A model's own files never import a `feature/`, and a feature imports no other feature.
// - `deck/serving/` is shared with the serve Worker, so it imports only itself and the protocol,
//   and the serve Worker imports only it.
// - Nothing a page sends to the browser imports zod, which would add 25 kB to it: no component,
//   and nothing a component imports, other than with `import type`.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const APP = resolve(import.meta.dirname, "../..");
const PROTOCOL = resolve(APP, "../../src/pub/protocol.ts");
const MODELS = ["person", "deck", "comment"] as const;
const VOID_SERVER = /^void(\/(db|env|storage|auth|schema-d1))?$/;

type Import = { spec: string; typeOnly: boolean; target: string | null };

function sources(dir: string): string[] {
  return readdirSync(join(APP, dir), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(ts|svelte)$/.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name));
}

function importsOf(file: string): Import[] {
  const text = readFileSync(file, "utf8");
  const found: Import[] = [];
  const statement =
    /(?:^|\n)\s*(import|export)\s+(type\s+)?(?:[^"';]*?\sfrom\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;
  for (const match of text.matchAll(statement)) {
    const spec = match[3] ?? match[4] ?? "";
    found.push({
      spec,
      typeOnly: Boolean(match[2]),
      target: spec.startsWith(".") ? resolve(dirname(file), spec) : null,
    });
  }
  return found;
}

/** Where a file sits: its layer, its model, and its feature if it is in one. */
function placeOf(file: string): { layer: string; model?: string; feature?: string; sub?: string } {
  const path = relative(APP, file).split("/");
  if (path[0] === "serve") {
    return { layer: "serve" };
  }
  if (path[1] === "model") {
    const model = path[2] ?? "";
    const featureAt = path.indexOf("feature");
    return {
      layer: "model",
      model,
      ...(featureAt === -1 ? {} : { feature: `${model}/${path[featureAt + 1]}` }),
      ...(path[3] && !path[3].includes(".") ? { sub: path[3] } : {}),
    };
  }
  return { layer: path[1] ?? "" };
}

const isServer = (file: string) => file.endsWith(".server.ts");

function problems(): string[] {
  const found: string[] = [];
  const files = [...sources("src"), ...sources("serve/src")];
  for (const file of files) {
    const from = placeOf(file);
    const name = relative(APP, file);
    for (const { spec, typeOnly, target } of importsOf(file)) {
      const say = (why: string) => found.push(`${name} imports ${spec}: ${why}`);
      if (!isServer(file)) {
        if (VOID_SERVER.test(spec)) {
          say("only a *.server.ts file calls Void");
        }
        if (spec === "@schema" && !typeOnly) {
          say("only a *.server.ts file reads the tables; take row types with import type");
        }
        if (target?.endsWith(".server.ts") || target?.endsWith(".server")) {
          say("only a *.server.ts file imports another");
        }
      }
      if (!target || target === PROTOCOL) {
        continue;
      }
      const to = placeOf(target);
      if (from.layer === "serve" || (from.model === "deck" && from.sub === "serving")) {
        if (
          !(to.model === "deck" && to.sub === "serving" && !isServer(target)) &&
          to.layer !== "serve"
        ) {
          say("the serving files and the serve Worker share only deck/serving");
        }
        continue;
      }
      if (from.layer === "common" && to.layer !== "common") {
        say("common knows no model and no shell");
      }
      if (
        from.layer === "shell" &&
        !(to.layer === "common" || to.layer === "shell" || (to.model === "person" && !to.feature))
      ) {
        say("the shell knows only common and the person model");
      }
      if (from.layer === "model" && to.layer === "model") {
        if (!from.feature && to.feature) {
          say("a model's own files import no feature");
        }
        if (from.feature && to.feature && from.feature !== to.feature) {
          say("a feature imports no other feature");
        }
        const order = (model?: string) => MODELS.indexOf(model as (typeof MODELS)[number]);
        if (!from.feature && order(to.model) > order(from.model)) {
          say(`${from.model} comes before ${to.model}; only a feature may import a later model`);
        }
      }
      if (from.model === "person" && !from.feature && to.layer === "shell") {
        say("the shell imports the person model, so the person model does not import the shell");
      }
    }
  }
  return found;
}

/** Each file the browser loads, by following what components import as values, that imports zod. */
function zodInTheBrowser(): string[] {
  const seen = new Set<string>();
  const queue = [...sources("src"), ...sources("pages")].filter((file) =>
    /\.svelte(\.ts)?$/.test(file),
  );
  const found: string[] = [];
  while (queue.length > 0) {
    const file = queue.pop() ?? "";
    if (seen.has(file)) {
      continue;
    }
    seen.add(file);
    for (const { spec, typeOnly, target } of importsOf(file)) {
      if (typeOnly) {
        continue;
      }
      if (spec === "zod" || spec.startsWith("zod/")) {
        found.push(`${relative(APP, file)} imports ${spec}, and a component reaches it`);
      }
      const path = target && !existsSync(target) ? `${target}.ts` : target;
      if (path && existsSync(path) && !path.endsWith(".server.ts")) {
        queue.push(path);
      }
    }
  }
  return found;
}

describe("import boundaries", () => {
  it("keep Void code, layers, models and features apart", () => {
    expect(problems()).toEqual([]);
  });

  it("keep zod out of what the browser loads", () => {
    expect(zodInTheBrowser()).toEqual([]);
  });
});
