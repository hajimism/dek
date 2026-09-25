import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { realpathSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mountPlayer, unmountPlayer } from "../helpers/dom.ts";
import { slideDocument } from "../helpers/html.ts";
import { writeProject } from "../helpers/project.ts";

// A script that measures its slide can only do so once the slide is in the document.
const measuringScript = `export default {
  draw(slide) {
    slide.querySelector("[data-seen]").textContent = String(slide.isConnected);
  },
};
`;

let root = "";

beforeAll(async () => {
  root = realpathSync(await mkdtemp(join(tmpdir(), "dek-")));
  await writeProject(root, {
    decks: [
      {
        name: "demo",
        script: "---\ntitle: Demo\n---\n\n## intro\n\nhello\n\n## chart\n\nbars\n",
        slides: {
          intro: slideDocument(`<section class="slide"><h2>intro</h2></section>`),
          chart: slideDocument(`<section class="slide"><p data-seen></p></section>`),
        },
      },
    ],
  });
  await writeFile(join(root, "decks", "demo", "slides", "chart.ts"), measuringScript);
  await mountPlayer(join(root, "decks", "demo"), { url: "file:///deck.html?presenter#intro" });
});

afterAll(async () => {
  await unmountPlayer();
  await rm(root, { recursive: true, force: true });
});

describe("slide copies outside the stage", () => {
  test("a rail thumbnail is drawn once it is in the document", () => {
    expect(
      document.querySelector('#dek-rail [data-slide-index="1"] [data-seen]')?.textContent,
    ).toBe("true");
  });

  test("the presenter's next preview is drawn once it is in the document", () => {
    expect(document.querySelector("#dek-next-stage [data-seen]")?.textContent).toBe("true");
  });

  test("keeps both copies out of focus and the accessibility tree", () => {
    const copies = [
      ...document.querySelectorAll<HTMLElement>("#dek-rail .slide, #dek-next-stage .slide"),
    ];
    expect(copies.length).toBe(3);
    for (const copy of copies) {
      expect(copy.hasAttribute("inert")).toBe(true);
      expect(copy.getAttribute("aria-hidden")).toBe("true");
    }
    // The rail's links name their slide themselves.
    expect(
      document.querySelector('#dek-rail [data-slide-index="1"]')?.getAttribute("aria-label"),
    ).toBe("2. chart");
  });

  test("puts the stage in the page's main landmark", () => {
    expect(document.querySelector("main #deck")).not.toBeNull();
    expect(document.querySelectorAll("main")).toHaveLength(1);
  });
});
