import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderDeckDocument } from "../../src/core/document.ts";
import { lockText, type PluginPage } from "../../src/core/plugin.ts";
import { pluginPages } from "../../src/core/plugin-host.ts";
import { resolveDeck } from "../../src/core/resolve.ts";
import { loadSlideSources, renderSlideHtml } from "../../src/core/still-page.ts";
import { withTempProject } from "../helpers/project.ts";

const page: PluginPage = {
  name: "study",
  keys: ["r"],
  script: '/* study-page */ console.log("</script>")',
  data: { "study.yaml": { text: "version: 1 </script>", version: "abc" } },
};

const deckSpec = {
  name: "demo",
  slides: { intro: '<section class="slide"><h1>Hi</h1></section>' },
};

function render(root: string, target: Parameters<typeof renderDeckDocument>[1]["target"]): string {
  const { deck } = resolveDeck(join(root, "decks", "demo"));
  return renderDeckDocument(deck, { playerScript: "/* player */", target, plugins: [page] });
}

const dev = {
  liveReloadScript: "",
  annotateScript: "",
} as const;

describe("a plugin's page", () => {
  test("goes into the player and the build, after the player, with its data", async () => {
    await withTempProject({ decks: [deckSpec] }, async (root) => {
      for (const html of [
        render(root, { kind: "build" }),
        render(root, { kind: "dev", mode: "player", includeNotes: true, ...dev }),
        render(root, { kind: "dev", mode: "player", includeNotes: false, ...dev }),
      ]) {
        expect(html.indexOf("/* study-page */")).toBeGreaterThan(html.indexOf("/* player */"));
        expect(html).toContain('id="dek-plugins"');
        // Neither the script nor the data can end the element they sit in.
        expect(html).not.toContain('console.log("</script>")');
        expect(html).not.toContain("version: 1 </script>");
      }
    });
  });

  test("never goes into the presenter view or a video", async () => {
    await withTempProject({ decks: [deckSpec] }, async (root) => {
      for (const html of [
        render(root, { kind: "dev", mode: "presenter", includeNotes: true, ...dev }),
        render(root, { kind: "video" }),
      ]) {
        expect(html).not.toContain("study-page");
        expect(html).not.toContain("dek-plugins");
      }
    });
  });

  test("never goes into a still page, which knows nothing of plugins", async () => {
    await withTempProject({ decks: [deckSpec] }, async (root) => {
      const { deck } = resolveDeck(join(root, "decks", "demo"));
      const html = renderSlideHtml(loadSlideSources(deck), "intro", 0);
      expect(html).not.toContain("dek-plugins");
    });
  });
});

describe("pluginPages", () => {
  test("gives a page to a pinned plugin that ships one, with its data files as the deck has them", async () => {
    await withTempProject(
      { toml: "[plugins.study]\n[plugins.quiz]\n", decks: [deckSpec] },
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        const scripts = { study: "/* study */" };
        // Not pinned yet: no page.
        expect(pluginPages(root, deckDir, scripts)).toEqual([]);

        mkdirSync(join(root, "plugins", "study"), { recursive: true });
        writeFileSync(
          join(root, "plugins", "study", "plugin.json"),
          lockText({
            schema: 1,
            name: "study",
            version: "0.1.0",
            page: { api: 1, keys: ["r"] },
            data: [{ path: "study.yaml" }, { path: "shared.yaml", in: "project" }],
          }),
        );
        expect(pluginPages(root, deckDir, scripts)).toEqual([
          { name: "study", keys: ["r"], script: "/* study */", data: {} },
        ]);

        writeFileSync(join(deckDir, "study.yaml"), "version: 1\n");
        // The project's data is the check's alone (ADR 35), and never read from the deck.
        writeFileSync(join(root, "plugins", "study", "shared.yaml"), "project\n");
        writeFileSync(join(deckDir, "shared.yaml"), "deck\n");
        const [withData] = pluginPages(root, deckDir, scripts);
        expect(withData?.data).toEqual({
          "study.yaml": {
            text: "version: 1\n",
            version: expect.stringMatching(/^[0-9a-f]{16}$/),
          },
        });
      },
    );
  });
});
