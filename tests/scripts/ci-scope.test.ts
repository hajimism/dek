import { describe, expect, test } from "bun:test";
import { scopeOf } from "../../scripts/ci-scope.ts";

describe("scopeOf", () => {
  test("checks dek.pub alone for a change to apps/ alone", () => {
    expect(
      scopeOf(["apps/pub/src/model/deck/access.ts", "apps/pub/tests/unit/deck.test.ts"]),
    ).toEqual({ root: false, pub: true });
    expect(scopeOf(["apps/pub/serve/src/index.ts", "apps/pub/infra/alchemy.run.ts"])).toEqual({
      root: false,
      pub: true,
    });
  });

  test("checks dek alone for docs, records, its own tests and what it writes about itself", () => {
    expect(
      scopeOf([
        "docs/guide/publish.md",
        "docs/ja/guide/publish.md",
        "adr/0091-x.md",
        "tests/core/lint.test.ts",
        "skills/dek/SKILL.md",
        "README.md",
        "README.ja.md",
        "CONTRIBUTING.md",
        "CHANGELOG.md",
        "AGENTS.md",
      ]),
    ).toEqual({ root: true, pub: false });
  });

  test("checks both for dek's code and samples, which dek.pub's round trip builds and publishes", () => {
    expect(scopeOf(["src/core/build.ts"])).toEqual({ root: true, pub: true });
    expect(scopeOf(["src/pub/protocol.ts"])).toEqual({ root: true, pub: true });
    expect(scopeOf(["sample/decks/why-dek/script.md"])).toEqual({ root: true, pub: true });
  });

  test("checks both for anything shared or not known", () => {
    for (const file of [
      "package.json",
      "bun.lock",
      "mise.toml",
      "tsconfig.json",
      "biome.json",
      "knip.json",
      "bunfig.toml",
      ".github/workflows/ci.yml",
      "scripts/ci-scope.ts",
      "evals/agent/shim.ts",
      "something-new.txt",
    ]) {
      expect([file, scopeOf([file])]).toEqual([file, { root: true, pub: true }]);
    }
  });

  test("checks both when it cannot tell what changed", () => {
    expect(scopeOf([])).toEqual({ root: true, pub: true });
  });

  test("takes the widest of the files a change holds", () => {
    expect(scopeOf(["apps/pub/AGENTS.md", "docs/guide/publish.md"])).toEqual({
      root: true,
      pub: true,
    });
  });
});
