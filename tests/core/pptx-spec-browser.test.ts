import { describe, expect } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { type PlaywrightRunner, playwrightResolved } from "../../src/core/playwright.ts";
import { runVisualRequest } from "../../src/core/playwright-visual.ts";
import { pptxJsonSchema } from "../../src/core/pptx-json.ts";
import { type PptxSpec, type PptxSpecNode, pptxSpecDeck } from "../../src/core/pptx-spec.ts";
import { serialBrowserTest, sharedBrowser } from "../helpers/browser.ts";
import { withTempProject } from "../helpers/project.ts";

// `dekc pptx spec` in a real Chromium: what a slide is made of, as an agent rebuilding it reads it.
const skip = !playwrightResolved() || Boolean(process.env.DEK_PLAYWRIGHT);
const browserTest = serialBrowserTest(skip);
const withBrowser = sharedBrowser();
const runner: PlaywrightRunner = (request) =>
  withBrowser((browser) => runVisualRequest(browser, request));

const html = `<section class="slide" data-layout="default">
  <p class="kicker"><span class="badge"></span>Setup</p>
  <h2 class="slide-title">準備は、何もいらない</h2>
  <p class="line">打つのは <span class="chip">dekc init</span> だけ。</p>
  <div class="glow"></div>
</section>`;

const css = `
.slide { counter-reset: page 4; }
.badge { display: inline-block; width: 20px; height: 20px; background: #4f46e5; border-radius: 99px; }
.badge::before { counter-increment: page; content: counter(page, decimal-leading-zero); color: #fff; font-size: 12px; }
.slide-title { font-feature-settings: "palt"; font-size: 48px; width: max-content; }
.chip { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 2px 6px; }
.glow { width: 200px; height: 100px; background: linear-gradient(90deg, #c7d2fe, transparent); }
`;

/** Every node of the outline, depth first. */
function nodes(node: PptxSpecNode | undefined): PptxSpecNode[] {
  return node ? [node, ...(node.children ?? []).flatMap(nodes)] : [];
}

describe("pptxSpecDeck in a browser", () => {
  browserTest("writes each slide's outline, its parts, and the deck as JSON to edit", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            script:
              "---\ntitle: Demo\nlang: ja\n---\n\n## 準備は、何もいらない {#setup}\n\nhello\n",
            slides: { setup: html },
            styles: { setup: css },
          },
        ],
      },
      async (root) => {
        const deck = join(root, "decks", "demo");
        const done = await pptxSpecDeck(deck, { runner });
        const spec = JSON.parse(readFileSync(done.spec, "utf8")) as PptxSpec;
        const [slide] = spec.slides;
        expect(slide).toMatchObject({ slug: "setup", layout: "default" });
        const all = nodes(slide?.outline);

        // A counter is counted, and its text is a node of its own where it is drawn.
        const mark = all.find((node) => node.tag === "::before");
        expect(mark?.text?.content).toBe("05");
        expect(mark?.width).toBeGreaterThan(0);

        // A chip's text stays its line's; the chip is a node too, for its box.
        const line = all.find((node) => node.class === "line");
        expect(line?.text?.content).toBe("打つのは dekc init だけ。");
        const chip = all.find((node) => node.class === "chip");
        expect(chip).toMatchObject({ inline: true, fill: "#f8fafc", radius: 6 });
        expect(chip?.padding).toEqual({ top: 2, right: 6, bottom: 2, left: 6 });

        // Proportional kana come out wider where nothing spaces them.
        const title = all.find((node) => node.heading === 2);
        expect(title?.text?.widen).toBeGreaterThan(1);

        // A gradient is a part, drawn alone, and says why.
        const glow = all.find((node) => node.class === "glow");
        expect(glow).toMatchObject({ picture: "drawn", drawn: ["gradient"] });
        expect(existsSync(join(deck, glow?.part ?? "missing"))).toBe(true);
        expect(existsSync(join(deck, slide?.shot ?? "missing"))).toBe(true);

        // What to start from is a file --from takes as it is.
        const start = JSON.parse(readFileSync(done.start, "utf8"));
        expect(pptxJsonSchema.safeParse(start).success).toBe(true);
      },
    );
  });
});
