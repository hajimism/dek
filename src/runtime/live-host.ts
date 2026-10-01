/// <reference lib="dom" />

import { type LiveHost, slideSelector } from "./live.ts";

export function documentLiveHost(): LiveHost {
  return {
    replaceSlide(slug, html) {
      const current = document.querySelector(slideSelector(slug));
      if (current) {
        current.outerHTML = html;
      }
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
