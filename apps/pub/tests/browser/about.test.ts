import { describe, expect, it } from "vitest";
import { type Locator, page } from "vitest/browser";
import About from "../../src/shell/ui/about.svelte";
import { renderPage } from "./setup.ts";

const sample = {
  href: "/@demo/why-dek",
  title: "Scripts first",
  handle: "demo",
  picture: "/i/d_1/1/cover.png",
};

// `toHaveTextContent` takes the whole text; these check a part of it.
const textOf = (locator: Locator) => locator.element().textContent ?? "";

describe("About", () => {
  it("opens with what dek.pub is for, then a real talk on it", async () => {
    await renderPage(About, { sample }, { viewer: null });
    await expect
      .element(page.getByRole("heading", { level: 1 }))
      .toHaveTextContent("A talk keeps reaching people after you give it");
    await expect
      .element(page.getByRole("link", { name: "Scripts first" }))
      .toHaveAttribute("href", "/@demo/why-dek");
  });

  it("leaves the sample out when there is none", async () => {
    await renderPage(About, { sample: null }, { viewer: null });
    await expect.element(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(page.getByRole("link", { name: "Scripts first" }).elements()).toHaveLength(0);
  });

  it("shows a stage direction in script.md and gone from the article", async () => {
    await renderPage(About, { sample: null }, { viewer: null });
    const direction = "Ask the room who starts from slides.";
    expect(textOf(page.getByRole("figure", { name: "script.md, on your machine" }))).toContain(
      direction,
    );
    const article = textOf(page.getByRole("figure", { name: "The article on dek.pub" }));
    expect(article).toContain("Why the script comes first");
    expect(article).not.toContain(direction);
  });

  it("tells, for each visibility, who opens it and where it is listed", async () => {
    await renderPage(About, { sample: null }, { viewer: null });
    const table = page.getByRole("table");
    for (const header of ["Who can open it", "Profile and RSS", "Search engines"]) {
      await expect.element(table.getByRole("columnheader", { name: header })).toBeVisible();
    }
    const cells = (name: string) =>
      table
        .getByRole("row", { name: new RegExp(`^${name}`) })
        .getByRole("cell")
        .elements()
        .map((cell) => cell.textContent);
    expect(cells("Private")).toEqual([
      "You, and the people you share it with",
      "Not listed",
      "Not indexed",
    ]);
    expect(cells("Public")).toEqual(["Anyone", "Listed", "Indexed"]);
  });

  it("speaks to readers, speakers and reviewers in turn", async () => {
    await renderPage(About, { sample: null }, { viewer: null });
    for (const name of [
      "If you came to read",
      "If you give talks",
      "If you were asked to review",
    ]) {
      await expect.element(page.getByRole("heading", { level: 3, name })).toBeVisible();
    }
  });

  it("gives the commands to start with as one block", async () => {
    await renderPage(About, { sample: null }, { viewer: null });
    expect(textOf(page.getByLabelText("Commands"))).toBe(
      "$ dekc pub login\n$ dekc pub publish\n$ dekc pub share --visibility link\n",
    );
  });

  it("links to the docs in the reader's language", async () => {
    await renderPage(About, { sample: null }, { viewer: null, lang: "ja" });
    await expect
      .element(page.getByRole("link", { name: "dek.pub で公開する" }))
      .toHaveAttribute("href", "https://hajimism.github.io/dek/ja/guide/publish.html");
  });

  it("asks a visitor to sign in, and sends someone signed in to their talks", async () => {
    await renderPage(About, { sample: null }, { viewer: null });
    await expect
      .element(page.getByRole("link", { name: "Sign in with GitHub" }))
      .toHaveAttribute("href", "/signin");
    document.body.innerHTML = "";
    await renderPage(About, { sample: null });
    await expect
      .element(page.getByRole("link", { name: "Go to your talks" }))
      .toHaveAttribute("href", "/@demo");
  });
});
