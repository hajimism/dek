import { describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import ProfileMore from "../../src/model/person/feature/profile/ui/profile-more.svelte";
import { renderPage } from "./setup.ts";

describe("ProfileMore", () => {
  it("is a link to the next page that says how many talks are left", async () => {
    await renderPage(ProfileMore, {
      href: "/@demo?page=2",
      remaining: 38,
      loading: false,
      onmore: () => {},
    });
    await expect
      .element(page.getByRole("link", { name: "Show more (38 left)" }))
      .toHaveAttribute("href", "/@demo?page=2");
  });

  it("loads the next talks in place, rather than following the link", async () => {
    const onmore = vi.fn();
    const before = location.href;
    await renderPage(ProfileMore, { href: "/@demo?page=2", remaining: 38, loading: false, onmore });
    await page.getByRole("link", { name: "Show more (38 left)" }).click();
    expect(onmore).toHaveBeenCalledOnce();
    expect(location.href).toBe(before);
  });

  it("says it is busy while the talks load, and is not there once none are left", async () => {
    const rendered = await renderPage(ProfileMore, {
      href: "/@demo?page=2",
      remaining: 38,
      loading: true,
      onmore: () => {},
    });
    await expect.element(page.getByRole("link")).toHaveAttribute("aria-busy", "true");
    await rendered.rerender({
      href: "/@demo?page=3",
      remaining: 0,
      loading: false,
      onmore: () => {},
    });
    expect(page.getByRole("link").query()).toBeNull();
  });
});
