import { afterEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import "../../src/common/ui/tokens.css";
import SettingsPage from "../../src/model/person/feature/settings/ui/settings-page.svelte";
import { renderPage } from "./setup.ts";

/** Answer each call with `answer`, or with what it was sent when there is none: a save that works. */
function server(answer?: { status: number; body: unknown }) {
  const fetch = vi.fn(async (_path: string, init?: RequestInit) => {
    if (answer) {
      return new Response(JSON.stringify(answer.body), { status: answer.status });
    }
    const sent = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(
      JSON.stringify("name" in sent ? { id: "u1", handle: "demo", ...sent } : sent),
    );
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

const sent = (fetch: ReturnType<typeof server>) =>
  fetch.mock.calls.map(([path, init]) => ({
    path,
    method: init?.method,
    body: JSON.parse(String(init?.body)),
  }));

const props = {
  handle: "demo",
  name: "Hajime Nakagawa",
  links: ["https://github.com/hajimism", "https://hajimism.dev/"],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SettingsPage", () => {
  it("shows the handle as it stays, the name, and each link in order as the profile names it", async () => {
    server();
    await renderPage(SettingsPage, props);
    await expect.element(page.getByText("@demo", { exact: true })).toBeInTheDocument();
    await expect.element(page.getByRole("textbox", { name: "Handle" })).not.toBeInTheDocument();
    await expect
      .element(page.getByRole("textbox", { name: "Name" }))
      .toHaveValue("Hajime Nakagawa");
    await expect
      .element(page.getByRole("textbox", { name: "Link 1" }))
      .toHaveValue("https://github.com/hajimism");
    await expect
      .element(page.getByRole("textbox", { name: "Link 2" }))
      .toHaveValue("https://hajimism.dev/");
    await expect.element(page.getByText("hajimism", { exact: true })).toBeInTheDocument();
    await expect.element(page.getByText("hajimism.dev", { exact: true })).toBeInTheDocument();
  });

  it("adds, moves and removes links, and saves them in their new order", async () => {
    const fetch = server();
    await renderPage(SettingsPage, props);
    await page.getByRole("button", { name: "Add a link" }).click();
    const third = page.getByRole("textbox", { name: "Link 3" });
    await expect.element(third).toHaveFocus();
    await userEvent.fill(third, "X.com/hajimism");
    await expect.element(page.getByText("@hajimism", { exact: true })).toBeInTheDocument();
    await page.getByRole("button", { name: "Move link 3 up" }).click();
    await page.getByRole("button", { name: "Move link 1 down" }).click();
    await page.getByRole("button", { name: "Remove link 3" }).click();
    await page.getByRole("button", { name: "Save links" }).click();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(sent(fetch)).toEqual([
      {
        path: "/api/me/links",
        method: "PUT",
        body: { links: ["https://x.com/hajimism", "https://github.com/hajimism"] },
      },
    ]);
    await expect
      .element(page.getByRole("textbox", { name: "Link 1" }))
      .toHaveValue("https://x.com/hajimism");
    await expect.element(page.getByRole("textbox", { name: "Link 3" })).not.toBeInTheDocument();
  });

  it("says what keeps a link from being saved, and sends nothing", async () => {
    const fetch = server();
    await renderPage(SettingsPage, props);
    const second = page.getByRole("textbox", { name: "Link 2" });
    await userEvent.fill(second, "http://hajimism.dev");
    await page.getByRole("button", { name: "Save links" }).click();
    await expect
      .element(page.getByText("Use an address that starts with https://."))
      .toBeInTheDocument();
    await expect.element(second).toHaveAttribute("aria-invalid", "true");
    await expect.element(second).toHaveFocus();
    await userEvent.fill(second, "github.com/hajimism");
    await page.getByRole("button", { name: "Save links" }).click();
    await expect.element(page.getByText("This link is in the list already.")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("drops an empty link, and adds no more than a profile shows", async () => {
    const fetch = server();
    await renderPage(SettingsPage, { ...props, links: [] });
    await expect.element(page.getByText("No links yet.")).toBeInTheDocument();
    const add = page.getByRole("button", { name: "Add a link" });
    for (let n = 1; n <= 5; n += 1) {
      await add.click();
    }
    await expect.element(add).toBeDisabled();
    await expect.element(page.getByText("A profile shows up to 5 links.")).toBeInTheDocument();
    await userEvent.fill(page.getByRole("textbox", { name: "Link 2" }), "zenn.dev/hajimism");
    await page.getByRole("button", { name: "Save links" }).click();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(sent(fetch)[0]?.body).toEqual({ links: ["https://zenn.dev/hajimism"] });
    await expect.element(page.getByRole("textbox", { name: "Link 2" })).not.toBeInTheDocument();
  });

  it("says what dek.pub refused a list for", async () => {
    server({
      status: 422,
      body: { error: { code: "links_too_many", message: "a profile shows up to 5 links" } },
    });
    await renderPage(SettingsPage, props);
    await page.getByRole("button", { name: "Save links" }).click();
    await expect.element(page.getByText("A profile shows up to 5 links.")).toBeInTheDocument();
  });

  it("saves the name, and says why an empty one is not", async () => {
    const fetch = server();
    await renderPage(SettingsPage, props);
    const name = page.getByRole("textbox", { name: "Name" });
    await userEvent.fill(name, "   ");
    await page.getByRole("button", { name: "Save name" }).click();
    await expect.element(page.getByText("Enter a name.")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
    await userEvent.fill(name, "  中川  元 ");
    await page.getByRole("button", { name: "Save name" }).click();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(sent(fetch)).toEqual([{ path: "/api/me", method: "PATCH", body: { name: "中川 元" } }]);
    await expect.element(name).toHaveValue("中川 元");
  });
});
