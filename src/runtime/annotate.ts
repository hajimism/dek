/// <reference lib="dom" />
// Annotate mode's entry: compiled apart from the player and embedded only on the dev server's
// pages for the speaker, so a built file carries none of it.

import { PAGE_ID, readPageConfig } from "../core/page.ts";
import type { PresenterSlide } from "../core/presenter-state.ts";
import { createAnnotateView } from "./annotate-view.ts";
import { deckUrl, liveTokenQuery } from "./routes.ts";

const dataEl = document.getElementById(PAGE_ID.data);
if (dataEl?.textContent) {
  const page = readPageConfig(document.body);
  createAnnotateView({
    deck: page.deck,
    slides: JSON.parse(dataEl.textContent) as PresenterSlide[],
    url: `${deckUrl(location.pathname, { kind: "annotations" })}${liveTokenQuery(page.liveToken)}`,
    fetch: (input, init) => fetch(input, init),
  });
}
