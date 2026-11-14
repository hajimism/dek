import { describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import RadioList from "../../src/common/ui/radio-list.svelte";
import SegmentedControl from "../../src/common/ui/segmented-control.svelte";
import DeviceCodeInput from "../../src/model/person/feature/connect-cli/ui/device-code-input.svelte";
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
    { value: "team", label: "Team only" },
    { value: "private", label: "Team and guests" },
    { value: "link", label: "Link only" },
    { value: "public", label: "Public" },
  ] as const;
  const radio = (name: string) => page.getByRole("radio", { name });
  const focusedLabel = () => document.activeElement?.textContent?.trim();

  it("is a radio group with the chosen option checked and the only one in the tab order", async () => {
    await renderPage(SegmentedControl, {
      options,
      value: "link",
      label: "Visibility",
      onselect: () => {},
    });
    await expect.element(page.getByRole("radiogroup", { name: "Visibility" })).toBeVisible();
    await expect.element(radio("Link only")).toHaveAttribute("aria-checked", "true");
    await expect.element(radio("Link only")).toHaveAttribute("tabindex", "0");
    await expect.element(radio("Public")).toHaveAttribute("tabindex", "-1");
    await expect.element(radio("Team only")).toHaveAttribute("tabindex", "-1");
  });

  it("moves focus with the arrow keys, Home and End, wrapping, and chooses nothing", async () => {
    const onselect = vi.fn();
    await renderPage(SegmentedControl, { options, value: "link", label: "Visibility", onselect });
    (radio("Link only").element() as HTMLElement).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(focusedLabel()).toBe("Public");
    await expect.element(radio("Public")).toHaveAttribute("tabindex", "0");
    await userEvent.keyboard("{ArrowRight}");
    expect(focusedLabel()).toBe("Team only");
    await userEvent.keyboard("{ArrowLeft}");
    expect(focusedLabel()).toBe("Public");
    await userEvent.keyboard("{Home}");
    expect(focusedLabel()).toBe("Team only");
    await userEvent.keyboard("{End}");
    expect(focusedLabel()).toBe("Public");
    expect(onselect).not.toHaveBeenCalled();
    await expect.element(radio("Link only")).toHaveAttribute("aria-checked", "true");
  });

  it("chooses the focused option with Enter or Space", async () => {
    const onselect = vi.fn();
    await renderPage(SegmentedControl, { options, value: "link", label: "Visibility", onselect });
    (radio("Link only").element() as HTMLElement).focus();
    await userEvent.keyboard("{ArrowRight}");
    await userEvent.keyboard("{Enter}");
    expect(onselect).toHaveBeenLastCalledWith("public");
    await userEvent.keyboard("{Home}");
    await userEvent.keyboard(" ");
    expect(onselect).toHaveBeenLastCalledWith("team");
  });

  it("shows what the owner decides, not what was asked for", async () => {
    const onselect = vi.fn();
    const view = await renderPage(SegmentedControl, {
      options,
      value: "private",
      label: "Visibility",
      onselect,
    });
    await radio("Public").click();
    expect(onselect).toHaveBeenCalledWith("public");
    await expect.element(radio("Public")).toHaveAttribute("aria-checked", "false");
    await view.rerender({ value: "public" });
    await expect.element(radio("Public")).toHaveAttribute("aria-checked", "true");
    await expect.element(radio("Team and guests")).toHaveAttribute("aria-checked", "false");
  });

  it("puts the tab stop back on the chosen option when focus leaves", async () => {
    await renderPage(SegmentedControl, {
      options,
      value: "link",
      label: "Visibility",
      onselect: () => {},
    });
    (radio("Link only").element() as HTMLElement).focus();
    await userEvent.keyboard("{ArrowRight}");
    (document.activeElement as HTMLElement).blur();
    await expect.element(radio("Link only")).toHaveAttribute("tabindex", "0");
    await expect.element(radio("Public")).toHaveAttribute("tabindex", "-1");
  });
});

describe("RadioList", () => {
  const options = [
    { value: "team", label: "Team only", hint: "Only you and your team.", icon: "lock" },
    { value: "private", label: "Team and guests", hint: "Your guests too." },
    { value: "link", label: "Link only", hint: "Anyone with the link." },
    { value: "public", label: "Public", hint: "Listed and indexed." },
  ] as const;
  const radio = (name: string) => page.getByRole("radio", { name, exact: true });
  const focusedLabel = () =>
    document.activeElement?.querySelector("[data-label]")?.textContent?.trim();

  it("is a named radio group of one row each, its hint describing it", async () => {
    await renderPage(RadioList, {
      options,
      value: "private",
      label: "Visibility",
      onselect: () => {},
    });
    const group = page.getByRole("radiogroup", { name: "Visibility" });
    await expect.element(group).toBeVisible();
    expect(group.getByRole("radio").elements()).toHaveLength(4);
    await expect.element(radio("Team only")).toHaveAccessibleDescription("Only you and your team.");
    await expect.element(radio("Team and guests")).toHaveAttribute("aria-checked", "true");
    await expect.element(radio("Team and guests")).toHaveAttribute("tabindex", "0");
    await expect.element(radio("Public")).toHaveAttribute("tabindex", "-1");
  });

  it("moves focus with the arrow keys, Home and End, and chooses nothing", async () => {
    const onselect = vi.fn();
    await renderPage(RadioList, { options, value: "private", label: "Visibility", onselect });
    (radio("Team and guests").element() as HTMLElement).focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(focusedLabel()).toBe("Link only");
    await userEvent.keyboard("{ArrowUp}");
    await userEvent.keyboard("{ArrowUp}");
    expect(focusedLabel()).toBe("Team only");
    await userEvent.keyboard("{ArrowUp}");
    expect(focusedLabel()).toBe("Public");
    await userEvent.keyboard("{Home}");
    expect(focusedLabel()).toBe("Team only");
    await userEvent.keyboard("{End}");
    expect(focusedLabel()).toBe("Public");
    expect(onselect).not.toHaveBeenCalled();
  });

  it("chooses with Space, Enter or a click, and shows what the owner decides", async () => {
    const onselect = vi.fn();
    const view = await renderPage(RadioList, {
      options,
      value: "private",
      label: "Visibility",
      onselect,
    });
    (radio("Team and guests").element() as HTMLElement).focus();
    await userEvent.keyboard("{ArrowDown}");
    await userEvent.keyboard(" ");
    expect(onselect).toHaveBeenLastCalledWith("link");
    await userEvent.keyboard("{End}");
    await userEvent.keyboard("{Enter}");
    expect(onselect).toHaveBeenLastCalledWith("public");
    await radio("Team only").click();
    expect(onselect).toHaveBeenLastCalledWith("team");
    // Declined: the value stays, and so does the checked row.
    await expect.element(radio("Team and guests")).toHaveAttribute("aria-checked", "true");
    await expect.element(radio("Team only")).toHaveAttribute("aria-checked", "false");
    await view.rerender({ value: "team" });
    await expect.element(radio("Team only")).toHaveAttribute("aria-checked", "true");
  });

  it("takes no choice while disabled", async () => {
    const onselect = vi.fn();
    await renderPage(RadioList, {
      options,
      value: "team",
      label: "Visibility",
      onselect,
      disabled: true,
    });
    await expect.element(page.getByRole("radiogroup")).toHaveAttribute("aria-disabled", "true");
    await radio("Public").click({ force: true });
    expect(onselect).not.toHaveBeenCalled();
    await expect.element(radio("Public")).toBeDisabled();
  });
});
