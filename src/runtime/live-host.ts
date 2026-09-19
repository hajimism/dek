/// <reference lib="dom" />

import { type LiveHost, slideSelector } from "./live.ts";

export function documentLiveHost(onReplace?: () => void): LiveHost {
  return {
    replaceSlide(slug, html) {
      const current = document.querySelector(slideSelector(slug));
      if (!current) {
        return undefined;
      }
      const wasCurrent = current.classList.contains("is-current");
      current.outerHTML = html;
      onReplace?.();
      const next = document.querySelector(slideSelector(slug));
      if (!next) {
        return undefined;
      }
      if (wasCurrent) {
        next.classList.add("is-current");
      }
      return {
        querySelectorAll(selector) {
          return [...next.querySelectorAll(selector)];
        },
      };
    },
    setTheme(css) {
      const el = document.querySelector("style[data-dek-theme]");
      if (el) {
        el.textContent = css;
      }
    },
    setDiagnostics(text) {
      let el = document.querySelector(".dek-diagnostics");
      if (!text) {
        el?.remove();
        return;
      }
      if (!el) {
        el = document.createElement("div");
        el.className = "dek-diagnostics";
        document.body.prepend(el);
      }
      el.textContent = text;
    },
  };
}
