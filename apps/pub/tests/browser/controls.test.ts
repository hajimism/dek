import { describe, expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import DeviceCodeInput from "../../src/ui/DeviceCodeInput.svelte";
import SegmentedControl from "../../src/ui/SegmentedControl.svelte";
import { renderPage } from "./setup.ts";

describe("DeviceCodeInput", () => {
  it("upper-cases what is typed and adds the hyphen after four characters", async () => {
    await renderPage(DeviceCodeInput, { label: "Device code" });
    const input = page.getByRole("textbox", { name: "Device code" });
    await userEvent.type(input, "kqwfxrtm");
    await expect.element(input).toHaveValue("KQWF-XRTM");
  });

  it("takes a pasted code with its hyphen, and stops at eight characters", async () => {
    await renderPage(DeviceCodeInput, { label: "Device code" });
    const input = page.getByRole("textbox", { name: "Device code" });
    await userEvent.fill(input, "abcd-efgh-ijk");
    await expect.element(input).toHaveValue("ABCD-EFGH");
  });

  it("says what is wrong under the field", async () => {
    await renderPage(DeviceCodeInput, { label: "Device code", error: "That code isn’t right." });
    await expect.element(page.getByRole("alert")).toHaveTextContent("That code isn’t right.");
    await expect.element(page.getByRole("textbox")).toHaveAttribute("aria-invalid", "true");
  });
});

describe("SegmentedControl", () => {
  const options = [
    { value: "private", label: "Private" },
    { value: "link", label: "Link only" },
    { value: "public", label: "Public" },
  ] as const;

  it("is a radio group with the current option checked and the only one in the tab order", async () => {
    await renderPage(SegmentedControl, {
      options,
      value: "link",
      label: "Visibility",
      onselect: () => {},
    });
    await expect.element(page.getByRole("radiogroup", { name: "Visibility" })).toBeVisible();
    await expect
      .element(page.getByRole("radio", { name: "Link only" }))
      .toHaveAttribute("aria-checked", "true");
    await expect
      .element(page.getByRole("radio", { name: "Link only" }))
      .toHaveAttribute("tabindex", "0");
    await expect
      .element(page.getByRole("radio", { name: "Public" }))
      .toHaveAttribute("tabindex", "-1");
  });

  it("moves with the arrow keys, Home and End, wrapping around", async () => {
    const onselect = vi.fn();
    await renderPage(SegmentedControl, { options, value: "link", label: "Visibility", onselect });
    await page.getByRole("radio", { name: "Link only" }).click();
    expect(onselect).not.toHaveBeenCalled();
    await userEvent.keyboard("{ArrowRight}");
    expect(onselect).toHaveBeenLastCalledWith("public");
    await userEvent.keyboard("{ArrowLeft}");
    expect(onselect).toHaveBeenLastCalledWith("link");
    await userEvent.keyboard("{End}");
    expect(onselect).toHaveBeenLastCalledWith("public");
    await userEvent.keyboard("{Home}");
    expect(onselect).toHaveBeenLastCalledWith("private");
  });

  it("wraps from the first option to the last", async () => {
    const onselect = vi.fn();
    await renderPage(SegmentedControl, {
      options,
      value: "private",
      label: "Visibility",
      onselect,
    });
    (page.getByRole("radio", { name: "Private" }).element() as HTMLElement).focus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(onselect).toHaveBeenLastCalledWith("public");
  });

  it("asks the owner on click and leaves the choice to it", async () => {
    const onselect = vi.fn();
    await renderPage(SegmentedControl, {
      options,
      value: "private",
      label: "Visibility",
      onselect,
    });
    await page.getByRole("radio", { name: "Public" }).click();
    expect(onselect).toHaveBeenCalledWith("public");
    await expect
      .element(page.getByRole("radio", { name: "Private" }))
      .toHaveAttribute("aria-checked", "true");
  });
});
