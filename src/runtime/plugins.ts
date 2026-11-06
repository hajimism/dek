/// <reference lib="dom" />

import { PAGE_ID } from "../core/page.ts";
import type { Position } from "../core/step.ts";
import type { DekPage, PageApi, PageMount, PagePosition } from "../plugin-api.ts";
import { isLetterKey, isTextEntry } from "./step.ts";

/**
 * Page API 1 (ADR 33): `window.dek.plugin`, which a plugin's page calls once it runs, after the
 * player. Each plugin gets a layer over every slide, in the slide's own pixels, kept in `#deck`
 * beside the slides so that it scales and moves with them, and is captured with them in a view
 * transition, while a slide's own markup, which lint checked, is never touched.
 */

/** What the page carries for each plugin: its declared keys and its data files. */
type PluginConfig = Record<
  string,
  { keys: string[]; data: Record<string, { text: string; version: string }> }
>;

export type PluginHost = {
  /** Show the layers of the slide at `pos`; runs inside each move, as the stage draws it. */
  render(pos: Position): void;
  /** The deck settled at `pos`: every plugin hears where it stands. */
  settled(pos: Position): void;
};

type Registered = {
  name: string;
  change: Array<(position: PagePosition) => void>;
  mount: Array<(mount: PageMount) => void>;
  layers: Map<string, HTMLElement>;
};

const LAYER_CLASS = "dek-plugin-layer";
const PAGE_API = 1;

export function createPluginHost(options: {
  deck: string;
  slides: Array<{ slug: string; title: string; beats: unknown[] }>;
  position: () => Position;
}): PluginHost {
  // The plugins' block comes after the player in the page, so it is read when a plugin asks.
  let config: PluginConfig | undefined;
  const registered: Registered[] = [];
  const keys = new Map<string, { plugin: string; listener: () => void }>();

  const at = (pos: Position): PagePosition => ({
    slug: options.slides[pos.slideIndex]?.slug ?? "",
    index: pos.slideIndex,
    beat: pos.beatIndex,
  });

  /** Runs a plugin's code; what it throws is the plugin's, and the player goes on. */
  const guard = (name: string, run: () => void): void => {
    try {
      run();
    } catch (error) {
      console.error(`dek: plugin ${name} threw`, error);
    }
  };

  const slideEl = (slug: string): HTMLElement | null =>
    document.querySelector<HTMLElement>(
      `#${PAGE_ID.deck} > .slide[data-slug="${CSS.escape(slug)}"]`,
    );

  /** The plugin's layer over `slug`, made on first use, after the slides in `#deck`. */
  const layerOf = (plugin: Registered, slug: string): HTMLElement => {
    let host = plugin.layers.get(slug);
    if (!host) {
      host = document.createElement("div");
      host.className = LAYER_CLASS;
      host.dataset.plugin = plugin.name;
      host.dataset.slug = slug;
      host.setAttribute("aria-hidden", "true");
      // The layer is the slide's box; only what a plugin draws in it takes the pointer.
      host.style.cssText = "position:absolute;inset:0;pointer-events:none;display:none";
      host.attachShadow({ mode: "open" });
      document.getElementById(PAGE_ID.deck)?.append(host);
      plugin.layers.set(slug, host);
    }
    return host;
  };

  const mount = (plugin: Registered, slug: string): void => {
    const root = slideEl(slug);
    const layer = layerOf(plugin, slug).shadowRoot;
    if (!root || !layer) {
      return;
    }
    layer.replaceChildren();
    for (const listener of plugin.mount) {
      guard(plugin.name, () => listener({ slug, root, layer, view: "stage" }));
    }
  };

  const render = (pos: Position): void => {
    const slug = options.slides[pos.slideIndex]?.slug;
    for (const plugin of registered) {
      for (const [layerSlug, host] of plugin.layers) {
        host.style.display = layerSlug === slug ? "block" : "none";
      }
    }
  };

  const settled = (pos: Position): void => {
    for (const plugin of registered) {
      for (const listener of plugin.change) {
        guard(plugin.name, () => listener(at(pos)));
      }
    }
  };

  const dek: DekPage = {
    plugin(name, pluginOptions, setup) {
      if (pluginOptions?.api !== PAGE_API) {
        console.error(
          `dek: plugin ${name} asks for page API ${String(pluginOptions?.api)}; this dek gives ${PAGE_API}`,
        );
        return;
      }
      config ??= readConfig();
      const declared = config[name];
      if (!declared || registered.some((plugin) => plugin.name === name)) {
        console.error(`dek: plugin ${name} is not one this page carries`);
        return;
      }
      const plugin: Registered = { name, change: [], mount: [], layers: new Map() };
      const api: PageApi = {
        deck: { name: options.deck },
        slides: options.slides.map(({ slug, title }) => ({ slug, title })),
        current: () => at(options.position()),
        on(event: "change" | "mount", listener: (value: never) => void) {
          if (event === "change" || event === "mount") {
            plugin[event].push(listener as never);
          }
        },
        shown: (element) => element.closest("[data-step]:not(.is-shown)") === null,
        data: (path) => declared.data[path] ?? null,
        key(letter, listener) {
          if (!declared.keys.includes(letter) || keys.has(letter)) {
            return false;
          }
          keys.set(letter, { plugin: name, listener });
          return true;
        },
      };
      let ok = true;
      try {
        setup(api);
      } catch (error) {
        ok = false;
        console.error(`dek: plugin ${name} threw`, error);
      }
      if (!ok) {
        for (const [letter, bound] of keys) {
          if (bound.plugin === name) {
            keys.delete(letter);
          }
        }
        return;
      }
      registered.push(plugin);
      for (const { slug } of options.slides) {
        mount(plugin, slug);
      }
      render(options.position());
      for (const listener of plugin.change) {
        guard(name, () => listener(at(options.position())));
      }
    },
  };
  window.dek = dek;

  document.addEventListener("keydown", (event) => {
    if (isTextEntry(event.target)) {
      return;
    }
    for (const [letter, bound] of keys) {
      if (isLetterKey(event, letter)) {
        event.preventDefault();
        guard(bound.plugin, bound.listener);
        return;
      }
    }
  });

  // A live reload swaps a slide for a new element: its layers start over on the new one.
  const deckEl = document.getElementById(PAGE_ID.deck);
  if (deckEl && typeof MutationObserver !== "undefined") {
    new MutationObserver((records) => {
      const replaced = new Set<string>();
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (
            node instanceof HTMLElement &&
            node.classList.contains("slide") &&
            node.dataset.slug
          ) {
            replaced.add(node.dataset.slug);
          }
        }
      }
      if (replaced.size === 0) {
        return;
      }
      for (const plugin of registered) {
        for (const slug of replaced) {
          mount(plugin, slug);
        }
      }
      render(options.position());
      settled(options.position());
    }).observe(deckEl, { childList: true });
  }

  // A printed deck is the slides alone.
  const style = document.createElement("style");
  style.textContent = `@media print { .${LAYER_CLASS} { display: none !important; } }`;
  document.head.append(style);

  return { render, settled };
}

function readConfig(): PluginConfig {
  const text = document.getElementById(PAGE_ID.plugins)?.textContent;
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text) as PluginConfig;
  } catch {
    return {};
  }
}
