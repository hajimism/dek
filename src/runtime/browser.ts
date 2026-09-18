/// <reference lib="dom" />

import { type Position, stepValuesForBeat } from "../core/step.ts";
import { playbackSchedule, type Timeline } from "../core/timeline.ts";
import { formatClock } from "../core/timing.ts";
import { deckScale, PRESENTER_RESERVED_RIGHT } from "./fit.ts";
import { createGuardedGo } from "./go.ts";
import {
  applyLiveEvent,
  type LiveHost,
  liveSlidePath,
  liveThemePath,
  slideSelector,
} from "./live.ts";
import {
  formatHash,
  hashChangeTarget,
  parseHash,
  parsePosition,
  positionsEqual,
} from "./position.ts";
import { createRehearseDriver, type RehearseDriver } from "./rehearse.ts";
import { waitForPlaybackSettle } from "./settle.ts";
import {
  advance,
  applyIsShown,
  applyMorphNames,
  clearMorphNames,
  keyToMove,
  retreat,
  shouldUseViewTransition,
} from "./step.ts";

type Slide = {
  slug: string;
  title: string;
  script: string;
  beats: Array<{ id?: string; title: string }>;
  budgetSeconds?: number;
};

const dataEl = document.getElementById("dek-data");
if (dataEl?.textContent) {
  const slides = JSON.parse(dataEl.textContent) as Slide[];
  const slugs = slides.map((slide) => slide.slug);
  let slideEls = [...document.querySelectorAll("#deck > .slide")];
  const presenter =
    new URLSearchParams(location.search).has("presenter") ||
    document.body.dataset.mode === "presenter";
  const presenterRoot = document.body.dataset.presenter
    ? document.getElementById(document.body.dataset.presenter)
    : null;
  if (presenter && presenterRoot) {
    presenterRoot.hidden = false;
  }
  const channel = new BroadcastChannel("dek");
  let pos = parseHash(location.hash, slugs);
  let startedAt: number | undefined;
  const elapsedEl = document.getElementById("dek-elapsed");
  const budgetEl = document.getElementById("dek-budget");
  const sockets: WebSocket[] = [];
  const rehearseMode = new URLSearchParams(location.search).has("rehearse");
  let rehearseDriver: RehearseDriver | undefined;
  if (location.protocol === "http:" || location.protocol === "https:") {
    const deckMatch = location.pathname.match(/^\/decks\/([^/]+)/);
    const wsPath = deckMatch?.[1] ? `/decks/${deckMatch[1]}/ws` : "/ws";
    const token = document.body.dataset.wsToken;
    const wsQuery = token ? `?token=${encodeURIComponent(token)}` : "";
    const ws = new WebSocket(
      `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}${wsPath}${wsQuery}`,
    );
    ws.addEventListener("message", (event) => {
      const next = parsePosition(String(event.data));
      if (next) {
        applyRemotePosition(next);
      }
    });
    sockets.push(ws);
  }

  function ensureTimer(): void {
    if (startedAt !== undefined) {
      return;
    }
    startedAt = Date.now();
    window.setInterval(() => {
      if (elapsedEl && startedAt !== undefined) {
        elapsedEl.textContent = formatClock((Date.now() - startedAt) / 1000);
      }
    }, 1000);
  }

  function slideEl(slug: string | undefined): Element | undefined {
    if (!slug) {
      return undefined;
    }
    return document.querySelector(slideSelector(slug)) ?? undefined;
  }

  function render(): void {
    const current = slides[pos.slideIndex];
    const currentEl = slideEl(current?.slug);
    for (const el of slideEls) {
      el.classList.toggle("is-current", el === currentEl);
    }
    const shown = current ? stepValuesForBeat(current.beats, pos.beatIndex) : new Set<string>();
    if (currentEl) {
      applyIsShown([...currentEl.querySelectorAll("[data-step]")], shown);
      applyMorphNames([...currentEl.querySelectorAll("[data-morph]")]);
    }
    for (const el of slideEls) {
      if (el !== currentEl) {
        clearMorphNames([...el.querySelectorAll("[data-morph]")]);
      }
    }
    const scriptEl = document.getElementById("dek-script");
    if (scriptEl && current) {
      scriptEl.textContent = current.script;
    }
    const nextEl = document.getElementById("dek-next");
    if (nextEl) {
      nextEl.textContent = slides[pos.slideIndex + 1]?.title ?? "";
    }
    const beatsEl = document.getElementById("dek-beats");
    if (beatsEl && current) {
      beatsEl.replaceChildren(
        ...current.beats.map((beat, i) => {
          const li = document.createElement("li");
          li.setAttribute("data-beat-index", String(i));
          li.textContent = beat.title;
          return li;
        }),
      );
    }
    document.querySelectorAll("[data-beat-index]").forEach((el) => {
      el.classList.toggle(
        "is-current-beat",
        Number(el.getAttribute("data-beat-index")) === pos.beatIndex,
      );
    });
    if (budgetEl) {
      budgetEl.textContent =
        current?.budgetSeconds !== undefined ? formatClock(current.budgetSeconds) : "";
    }
    const hash = formatHash(pos, slugs);
    if (hash && location.hash !== hash) {
      location.hash = hash;
    }
  }

  const go = createGuardedGo(async (next: Position) => {
    const apply = (): void => {
      pos = next;
      render();
    };
    let viewTransition: { finished: Promise<unknown> } | undefined;
    if (
      shouldUseViewTransition(pos.slideIndex, next.slideIndex) &&
      "startViewTransition" in document
    ) {
      const fromEl = slideEl(slides[pos.slideIndex]?.slug);
      if (fromEl) {
        applyMorphNames([...fromEl.querySelectorAll("[data-morph]")]);
      }
      viewTransition = document.startViewTransition(apply);
    } else {
      apply();
    }
    await waitForPlaybackSettle({
      animations: [...document.getAnimations()],
      viewTransition,
    });
    channel.postMessage(pos);
    ensureTimer();
    const payload = JSON.stringify(pos);
    for (const socket of sockets) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(payload);
      }
    }
  });

  function applyRemotePosition(next: Position): void {
    if (positionsEqual(pos, next)) {
      return;
    }
    if (rehearseDriver) {
      rehearseDriver.seek(next);
      return;
    }
    pos = next;
    render();
    ensureTimer();
  }

  channel.addEventListener("message", (event: MessageEvent) => {
    const raw = typeof event.data === "string" ? event.data : JSON.stringify(event.data);
    const next = parsePosition(raw);
    if (next) {
      applyRemotePosition(next);
    }
  });
  document.addEventListener("keydown", (event) => {
    const counts = slides.map((slide) => slide.beats.length);
    if (rehearseDriver) {
      if (event.key === " ") {
        event.preventDefault();
        if (rehearseDriver.playing()) {
          rehearseDriver.pause();
        } else {
          rehearseDriver.play();
        }
        return;
      }
      const rehearseMove = keyToMove(event.key);
      if (!rehearseMove) {
        return;
      }
      event.preventDefault();
      const next = rehearseMove === "advance" ? advance(pos, counts) : retreat(pos, counts);
      if (next) {
        rehearseDriver.seek(next);
      }
      return;
    }
    const move = keyToMove(event.key);
    if (!move) {
      return;
    }
    event.preventDefault();
    void go(move === "advance" ? advance(pos, counts) : retreat(pos, counts));
  });
  window.addEventListener("hashchange", () => {
    void go(hashChangeTarget(pos, location.hash, slugs));
  });

  function fitDeck(): void {
    const deckEl = document.getElementById("deck");
    if (!deckEl) {
      return;
    }
    const reserved =
      presenter && presenterRoot && !presenterRoot.hidden ? PRESENTER_RESERVED_RIGHT : 0;
    const scale = deckScale({
      viewport: { width: window.innerWidth, height: window.innerHeight },
      logical: { width: deckEl.offsetWidth || 1280, height: deckEl.offsetHeight || 720 },
      reservedRight: reserved,
    });
    deckEl.style.transform = `scale(${scale})`;
  }
  window.addEventListener("resize", fitDeck);
  fitDeck();
  render();
  // biome-ignore lint/complexity/useLiteralKeys: video recorder looks up window["dekGo"]
  (window as unknown as Record<string, unknown>)["dekGo"] = go;

  let startRehearse: (() => Promise<void>) | undefined;
  if (rehearseMode) {
    const deckMatch = location.pathname.match(/^\/decks\/([^/]+)/);
    const timelinePath = deckMatch?.[1]
      ? `/decks/${deckMatch[1]}/voice/timeline.json`
      : "/voice/timeline.json";
    const audioPath = timelinePath.replace("timeline.json", "audio.wav");
    startRehearse = async () => {
      const response = await fetch(timelinePath);
      if (!response.ok) {
        return;
      }
      const timeline = (await response.json()) as Timeline;
      const audioHead = await fetch(audioPath, { method: "HEAD" });
      const audio = audioHead.ok ? new Audio(audioPath) : undefined;
      const current = pos;
      rehearseDriver?.stop();
      rehearseDriver = createRehearseDriver({
        schedule: playbackSchedule(timeline, () => 300),
        go: (position) => go(position),
        now: audio ? () => audio.currentTime * 1000 : undefined,
        onPlay: () => {
          void audio?.play();
        },
        onPause: () => {
          audio?.pause();
        },
        onSeek: (ms) => {
          if (audio) {
            audio.currentTime = ms / 1000;
          }
        },
      });
      rehearseDriver.play();
      rehearseDriver.seek(current);
    };
    void startRehearse();
  }

  const liveHost = documentLiveHost(() => {
    slideEls = [...document.querySelectorAll("#deck > .slide")];
  });
  // Keep a string key so minify does not rename the hook liveReloadScript calls.
  // biome-ignore lint/complexity/useLiteralKeys: liveReloadScript looks up window["dekLive"]
  (window as unknown as Record<string, unknown>)["dekLive"] = async (raw: unknown) => {
    let event = raw as Parameters<typeof applyLiveEvent>[0];
    if (!event || typeof event !== "object" || !("type" in event)) {
      location.reload();
      return;
    }
    if (event.type === "timeline") {
      await startRehearse?.();
      return;
    }
    if (event.type === "reload-slide") {
      const response = await fetch(liveSlidePath(location.pathname, event.slug));
      event = { ...event, html: await response.text() };
    } else if (event.type === "reload-theme") {
      const response = await fetch(liveThemePath(location.pathname));
      event = { ...event, css: await response.text() };
    }
    const current = slides[pos.slideIndex];
    const shown = current ? stepValuesForBeat(current.beats, pos.beatIndex) : new Set<string>();
    if (applyLiveEvent(event, liveHost, { shown }).reload) {
      location.reload();
      return;
    }
    render();
  };
}

function documentLiveHost(onReplace?: () => void): LiveHost {
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
