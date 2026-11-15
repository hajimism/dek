import { afterEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import HandleForm from "../../src/model/person/feature/choose-handle/ui/handle-form.svelte";
import { renderPage } from "./setup.ts";

const newcomer = { viewer: { id: "u1", handle: null, name: "Sato", image: null } };

/** Answer each fetch by its method: GET with `status` for the handle asked, PUT with `put`. */
function server(
  taken: string[],
  put: { status: number; body: unknown } = { status: 200, body: {} },
) {
  const fetch = vi.fn(async (path: string, init?: RequestInit) => {
    if (init?.method === "PUT") {
      return new Response(JSON.stringify(put.body), { status: put.status });
    }
    const handle = decodeURIComponent(path.split("/").pop() ?? "");
    const status = taken.includes(handle) ? "taken" : "free";
    return new Response(JSON.stringify({ handle, status }));
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HandleForm", () => {
  it("offers the handle suggested, once dek.pub says it is free", async () => {
    const fetch = server([]);
    await renderPage(HandleForm, { suggestion: "octo-cat", onchosen: () => {} }, newcomer);
    await expect.element(page.getByRole("textbox", { name: "Handle" })).toHaveValue("octo-cat");
    await expect.element(page.getByText("@octo-cat is free.")).toBeInTheDocument();
    expect(fetch.mock.calls[0]?.[0]).toBe("/api/handles/octo-cat");
    await expect.element(page.getByRole("button", { name: "Use this handle" })).toBeEnabled();
  });

  it("says what keeps a handle from being chosen, and asks dek.pub only of one that may be", async () => {
    const fetch = server(["sato"]);
    await renderPage(HandleForm, { suggestion: null, onchosen: () => {} }, newcomer);
    const field = page.getByRole("textbox", { name: "Handle" });
    const button = page.getByRole("button", { name: "Use this handle" });
    await userEvent.fill(field, "Admin");
    await expect.element(page.getByText("@admin is kept for dek.pub.")).toBeInTheDocument();
    await expect.element(button).toBeDisabled();
    await userEvent.fill(field, "sa--to");
    await expect.element(page.getByText(/^A handle is lowercase letters/)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
    await userEvent.fill(field, "Sato");
    await expect.element(page.getByText("@sato is taken.")).toBeInTheDocument();
    await expect.element(button).toBeDisabled();
  });

  it("saves the handle chosen, and says so when someone took it first", async () => {
    const fetch = server([], {
      status: 409,
      body: { error: { code: "handle_taken", message: "@sato is taken" } },
    });
    const onchosen = vi.fn();
    await renderPage(HandleForm, { suggestion: "sato", onchosen }, newcomer);
    const button = page.getByRole("button", { name: "Use this handle" });
    await expect.element(button).toBeEnabled();
    await button.click();
    await expect.element(page.getByText("@sato is taken.")).toBeInTheDocument();
    expect(onchosen).not.toHaveBeenCalled();
    const [path, init] = fetch.mock.calls.find((call) => call[1]?.method === "PUT") ?? [];
    expect(path).toBe("/api/me/handle");
    expect(JSON.parse(String(init?.body))).toEqual({ handle: "sato" });

    server([], { status: 200, body: { id: "u1", handle: "sato-k", name: "Sato" } });
    await userEvent.fill(page.getByRole("textbox", { name: "Handle" }), "sato-k");
    await expect.element(page.getByText("@sato-k is free.")).toBeInTheDocument();
    await button.click();
    await vi.waitFor(() => expect(onchosen).toHaveBeenCalledWith("sato-k"));
  });
});
