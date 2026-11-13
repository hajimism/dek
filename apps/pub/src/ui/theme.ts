// The reader's theme, kept in a cookie so the server renders the right one on the first paint.

import type { Theme } from "../../middleware/01.shared.ts";

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === "system") {
    delete root.dataset.theme;
  } else {
    root.dataset.theme = theme;
  }
  // biome-ignore lint/suspicious/noDocumentCookie: one preference, read by the server on the next request.
  document.cookie = `theme=${theme}; path=/; max-age=31536000; samesite=lax`;
}
