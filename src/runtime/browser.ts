/// <reference lib="dom" />

import {
  nextPresenterTitle,
  type PresenterSlide,
  presenterState,
} from "../core/presenter-state.ts";
import { type Position, stepKey, stepValuesForBeat } from "../core/step.ts";
import { playbackSchedule, type Timeline } from "../core/timeline.ts";
import { formatClock } from "../core/timing.ts";
import { deckFitTransform } from "./fit.ts";
import { applyIncomingPosition, createGuardedGo } from "./go.ts";
import { applyLiveEvent, hydrateLiveEvent, slideSelector } from "./live.ts";
import { documentLiveHost } from "./live-host.ts";
import { createMotion, drawAtEnd, type MotionMode, type SlideModule } from "./motion.ts";
import {
  clampPosition,
  formatHash,
  hashChangeTarget,
  parseHash,
  parsePosition,
  positionsEqual,
} from "./position.ts";
import {
  elapsedTone,
  isPresenterToggleKey,
  presenterSearch,
  progressFill,
  totalBudgetSeconds,
} from "./presenter.ts";
import {
  clampRailWidth,
  isRailToggleKey,
  RAIL_VISIBLE_KEY,
  RAIL_WIDTH_KEY,
  readStoredRailVisible,
  readStoredRailWidth,
} from "./rail.ts";
import { createRehearseDriver, type RehearseDriver } from "./rehearse.ts";
import { withDeckPrefix } from "./routes.ts";
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

const dataEl = document.getElementById("dek-data");
if (dataEl?.textContent) {
  const slides = JSON.parse(dataEl.textContent) as PresenterSlide[];
  const slugs = slides.map((slide) => slide.slug);
  let slideEls = [...document.querySelectorAll("#deck > .slide")];
  const presenterRoot = document.body.dataset.presenter
    ? document.getElementById(document.body.dataset.presenter)
    : null;
  const progressEl = document.getElementById("dek-progress");
  if (
    presenterRoot &&
    (new URLSearchParams(location.search).has("presenter") ||
      document.body.dataset.mode === "presenter")
  ) {
    presenterRoot.hidden = false;
    document.body.classList.add("is-presenter");
    if (progressEl) {
      progressEl.hidden = false;
    }
  }
  const videoMode = document.body.dataset.mode === "video";
  const slideModules = (): Record<string, SlideModule> => window.__dekSlides ?? {};
  const motion = createMotion({
    now: () => performance.now(),
    requestFrame: (fn) => requestAnimationFrame(fn),
    cancelFrame: (id) => cancelAnimationFrame(id),
    setTimer: (fn, ms) => window.setTimeout(fn, ms),
    clearTimer: (id) => window.clearTimeout(id),
  });
  const channel = new BroadcastChannel("dek");
  let pos = parseHash(location.hash, slugs);
  let startedAt: number | undefined;
  const elapsedEl = document.getElementById("dek-elapsed");
  const budgetEl = document.getElementById("dek-budget");
  const talkBudget = totalBudgetSeconds(slides);
  const sockets: WebSocket[] = [];
  const rehearseMode = new URLSearchParams(location.search).has("rehearse");
  let rehearseDriver: RehearseDriver | undefined;
  if (location.protocol === "http:" || location.protocol === "https:") {
    const wsPath = withDeckPrefix(location.pathname, "/ws");
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

  function presenterOpen(): boolean {
    return Boolean(presenterRoot && !presenterRoot.hidden);
  }

  function setPresenterOpen(open: boolean): void {
    if (!presenterRoot) {
      return;
    }
    presenterRoot.hidden = !open;
    document.body.classList.toggle("is-presenter", open);
    if (progressEl) {
      progressEl.hidden = !open;
    }
    const search = presenterSearch(location.search, open);
    if (search !== location.search) {
      history.replaceState(null, "", `${location.pathname}${search}${location.hash}`);
    }
    fitDeck();
    render();
  }

  function railOpen(): boolean {
    return !document.body.classList.contains("is-rail-hidden");
  }

  function persistRail(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      // file:// or private mode may reject storage
    }
  }

  function setRailWidth(px: number): number {
    const width = clampRailWidth(px);
    document.documentElement.style.setProperty("--dek-rail-w", `${width}px`);
    return width;
  }

  function setRailOpen(open: boolean, persist = true): void {
    document.body.classList.toggle("is-rail-hidden", !open);
    if (persist) {
      persistRail(RAIL_VISIBLE_KEY, open ? "1" : "0");
    }
    fitDeck();
  }

  function syncElapsed(): void {
    if (!elapsedEl || startedAt === undefined) {
      return;
    }
    const elapsed = (Date.now() - startedAt) / 1000;
    elapsedEl.textContent = formatClock(elapsed);
    const tone = elapsedTone(elapsed, talkBudget);
    elapsedEl.classList.toggle("is-warn", tone === "warn");
    elapsedEl.classList.toggle("is-over", tone === "over");
  }

  function ensureTimer(): void {
    if (startedAt !== undefined) {
      return;
    }
    startedAt = Date.now();
    window.setInterval(syncElapsed, 1000);
    syncElapsed();
  }

  function slideEl(slug: string | undefined): HTMLElement | undefined {
    if (!slug) {
      return undefined;
    }
    return document.querySelector<HTMLElement>(slideSelector(slug)) ?? undefined;
  }

  function stripPreviewClone(root: HTMLElement): void {
    root.removeAttribute("id");
    root.style.removeProperty("view-transition-name");
    for (const el of root.querySelectorAll<HTMLElement>("[id], [data-morph]")) {
      el.removeAttribute("id");
      el.style.removeProperty("view-transition-name");
    }
  }

  /** Draw the current slide's script. Only the live element animates; clones get `drawStill`. */
  function showMotion(mode: MotionMode): void {
    const current = slides[pos.slideIndex];
    const el = slideEl(current?.slug);
    if (!current || !el) {
      motion.stop();
      return;
    }
    motion.show(el, slideModules()[current.slug], current.beats, pos.beatIndex, mode);
  }

  function motionModeFor(from: Position, to: Position): MotionMode {
    if (videoMode) {
      return "hold";
    }
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return "final";
    }
    const counts = slides.map((slide) => slide.beats.length);
    const stepped = advance(from, counts);
    return stepped && positionsEqual(stepped, to) ? "animate" : "final";
  }

  function drawStill(clone: HTMLElement, slide: PresenterSlide, index: number): void {
    drawAtEnd(slideModules()[slide.slug], clone, index, stepKey(slide.beats, index));
  }

  function neuterRailMedia(root: HTMLElement): void {
    for (const el of root.querySelectorAll("video, audio, iframe, object, embed")) {
      el.removeAttribute("src");
      el.removeAttribute("srcdoc");
      el.replaceChildren();
    }
  }

  function fillRailThumbs(): void {
    const rail = document.getElementById("dek-rail");
    const deckEl = document.getElementById("deck");
    if (!rail || !deckEl) {
      return;
    }
    const width = deckEl.offsetWidth || 1280;
    const height = deckEl.offsetHeight || 720;
    for (const [index, slide] of slides.entries()) {
      const frame = rail.querySelector(`[data-slide-index="${index}"] .dek-thumb-frame`);
      if (!(frame instanceof HTMLElement)) {
        continue;
      }
      const source = slideEl(slide.slug);
      if (!(source instanceof HTMLElement)) {
        frame.replaceChildren();
        continue;
      }
      const clone = source.cloneNode(true);
      if (!(clone instanceof HTMLElement)) {
        frame.replaceChildren();
        continue;
      }
      clone.classList.add("is-current");
      stripPreviewClone(clone);
      neuterRailMedia(clone);
      drawStill(clone, slide, 0);
      const stage = document.createElement("div");
      stage.className = "dek-thumb-stage";
      stage.style.width = `${width}px`;
      stage.style.height = `${height}px`;
      stage.append(clone);
      frame.replaceChildren(stage);
      fitStage(stage, frame);
    }
  }

  function fitRailThumbs(): void {
    const rail = document.getElementById("dek-rail");
    if (!rail || rail.offsetParent === null) {
      return;
    }
    for (const frame of rail.querySelectorAll(".dek-thumb-frame")) {
      if (!(frame instanceof HTMLElement)) {
        continue;
      }
      const stage = frame.querySelector(".dek-thumb-stage");
      if (stage instanceof HTMLElement) {
        fitStage(stage, frame);
      }
    }
  }

  function syncRailCurrent(): void {
    const rail = document.getElementById("dek-rail");
    if (!rail) {
      return;
    }
    for (const el of rail.querySelectorAll(".dek-thumb")) {
      const current = Number(el.getAttribute("data-slide-index")) === pos.slideIndex;
      el.classList.toggle("is-current", current);
      if (current) {
        el.setAttribute("aria-current", "page");
        el.scrollIntoView({ block: "nearest" });
      } else {
        el.removeAttribute("aria-current");
      }
    }
  }

  function renderNextPreview(
    nextPos: Position | null,
    nextSlide: PresenterSlide | undefined,
  ): void {
    const stage = document.getElementById("dek-next-stage");
    if (!stage) {
      return;
    }
    if (!presenterOpen() || !nextPos || !nextSlide) {
      stage.replaceChildren();
      return;
    }
    const source = slideEl(nextSlide.slug);
    const deckEl = document.getElementById("deck");
    if (!(source instanceof HTMLElement) || !deckEl) {
      stage.replaceChildren();
      return;
    }
    const clone = source.cloneNode(true);
    if (!(clone instanceof HTMLElement)) {
      stage.replaceChildren();
      return;
    }
    // Theme CSS hides unrevealed [data-step] only on .is-current.
    clone.classList.add("is-current");
    stripPreviewClone(clone);
    applyIsShown(
      [...clone.querySelectorAll("[data-step]")],
      stepValuesForBeat(nextSlide.beats, nextPos.beatIndex),
    );
    drawStill(clone, nextSlide, nextPos.beatIndex);
    const frame = document.createElement("div");
    frame.className = "dek-preview-frame";
    frame.style.width = `${deckEl.offsetWidth || 1280}px`;
    frame.style.height = `${deckEl.offsetHeight || 720}px`;
    frame.append(clone);
    stage.replaceChildren(frame);
    fitStage(frame, stage);
  }

  function fitStage(el: HTMLElement, stage: HTMLElement): void {
    el.style.transform = deckFitTransform(
      { width: stage.clientWidth, height: stage.clientHeight },
      { width: el.offsetWidth || 1280, height: el.offsetHeight || 720 },
    );
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
      applyMorphNames([...currentEl.querySelectorAll<HTMLElement>("[data-morph]")]);
    }
    for (const el of slideEls) {
      if (el !== currentEl) {
        clearMorphNames([...el.querySelectorAll<HTMLElement>("[data-morph]")]);
      }
    }
    const state = current ? presenterState(slides, pos) : undefined;
    const scriptEl = document.getElementById("dek-script");
    if (scriptEl && state) {
      scriptEl.textContent = state.script;
    }
    const counts = slides.map((slide) => slide.beats.length);
    const nextPos = advance(pos, counts);
    const nextSlide = nextPos ? slides[nextPos.slideIndex] : undefined;
    const nextEl = document.getElementById("dek-next");
    if (nextEl) {
      nextEl.textContent = state ? nextPresenterTitle(state) : "";
    }
    const nextEnd = document.getElementById("dek-next-end");
    if (nextEnd) {
      nextEnd.hidden = Boolean(nextPos);
    }
    const beatsEl = document.getElementById("dek-beats");
    if (beatsEl && state) {
      beatsEl.replaceChildren(
        ...state.current.beats.map((beat, i) => {
          const li = document.createElement("li");
          li.setAttribute("data-beat-index", String(i));
          li.textContent = beat.title;
          return li;
        }),
      );
    }
    document.querySelectorAll("#dek-beats [data-beat-index]").forEach((el) => {
      el.classList.toggle(
        "is-current-beat",
        Number(el.getAttribute("data-beat-index")) === pos.beatIndex,
      );
    });
    if (budgetEl) {
      budgetEl.textContent =
        current?.budgetSeconds !== undefined ? formatClock(current.budgetSeconds) : "";
    }
    const pageEl = document.getElementById("dek-page");
    if (pageEl) {
      const total = document.createElement("span");
      total.className = "dek-page-total";
      total.textContent = `/ ${slides.length}`;
      pageEl.replaceChildren(document.createTextNode(`${pos.slideIndex + 1} `), total);
    }
    if (progressEl) {
      progressEl.replaceChildren(
        ...slides.map((slide, index) => {
          const span = document.createElement("span");
          if (index < pos.slideIndex) {
            span.className = "is-done";
          } else if (index === pos.slideIndex) {
            span.className = "is-current";
            span.style.setProperty(
              "--dek-fill",
              `${progressFill(pos.beatIndex, slide.beats.length) * 100}%`,
            );
          }
          return span;
        }),
      );
    }
    renderNextPreview(nextPos, nextSlide);
    syncRailCurrent();
    const hash = formatHash(pos, slugs);
    if (hash && location.hash !== hash) {
      location.hash = hash;
    }
  }

  /**
   * The first key or move takes the key hint away. Removing it also drops its animation, which
   * the first move would otherwise wait on before it settles.
   */
  function dismissKeyHint(): void {
    document.getElementById("dek-hint")?.remove();
  }

  const go = createGuardedGo(async (next: Position) => {
    dismissKeyHint();
    const apply = (): void => {
      const from = pos;
      pos = next;
      render();
      // A hashchange echoing this same position must not cut a running animation short.
      if (!positionsEqual(from, next)) {
        showMotion(motionModeFor(from, next));
      }
    };
    let viewTransition: { finished: Promise<unknown> } | undefined;
    if (
      shouldUseViewTransition(pos.slideIndex, next.slideIndex) &&
      "startViewTransition" in document
    ) {
      const fromEl = slideEl(slides[pos.slideIndex]?.slug);
      if (fromEl) {
        applyMorphNames([...fromEl.querySelectorAll<HTMLElement>("[data-morph]")]);
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
    const clamped = clampPosition(
      next,
      slides.map((slide) => ({ beats: slide.beats.length })),
    );
    if (!clamped) {
      return;
    }
    applyIncomingPosition(go, clamped, {
      equal: positionsEqual,
      current: () => pos,
      ...(rehearseDriver
        ? {
            seek: (target: Position) => {
              rehearseDriver?.seek(target);
            },
          }
        : {}),
    });
  }

  channel.addEventListener("message", (event: MessageEvent) => {
    const raw = typeof event.data === "string" ? event.data : JSON.stringify(event.data);
    const next = parsePosition(raw);
    if (next) {
      applyRemotePosition(next);
    }
  });
  document.addEventListener("keydown", (event) => {
    dismissKeyHint();
    if (isPresenterToggleKey(event)) {
      if (presenterRoot) {
        event.preventDefault();
        setPresenterOpen(!presenterOpen());
      }
      return;
    }
    if (isRailToggleKey(event)) {
      if (document.getElementById("dek-rail") && !presenterOpen()) {
        event.preventDefault();
        setRailOpen(!railOpen());
      }
      return;
    }
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
    const currentStage = document.getElementById("dek-current-stage");
    if (deckEl instanceof HTMLElement && currentStage) {
      fitStage(deckEl, currentStage);
    }
    const preview = document.querySelector("#dek-next-stage .dek-preview-frame");
    const nextStage = document.getElementById("dek-next-stage");
    if (preview instanceof HTMLElement && nextStage && presenterOpen()) {
      fitStage(preview, nextStage);
    }
    fitRailThumbs();
  }
  window.addEventListener("resize", fitDeck);
  const railEl = document.getElementById("dek-rail");
  const railResize = document.getElementById("dek-rail-resize");
  if (railEl) {
    setRailWidth(readStoredRailWidth(localStorage));
    setRailOpen(readStoredRailVisible(localStorage), false);
    railEl.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
        return;
      }
      const thumb = event.target;
      if (!(thumb instanceof HTMLElement) || !thumb.classList.contains("dek-thumb")) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const index = Number(thumb.getAttribute("data-slide-index"));
      const nextIndex = index + (event.key === "ArrowDown" ? 1 : -1);
      if (!slides[nextIndex]) {
        return;
      }
      void go({ slideIndex: nextIndex, beatIndex: 0 });
      const nextThumb = railEl.querySelector(`[data-slide-index="${nextIndex}"]`);
      if (nextThumb instanceof HTMLElement) {
        nextThumb.focus({ preventScroll: true });
      }
    });
    if (railResize) {
      railResize.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        try {
          railResize.setPointerCapture(event.pointerId);
        } catch {
          // synthetic events may not support capture
        }
        railResize.setAttribute("data-dragging", "");
        let width = setRailWidth(event.clientX);
        const move = (ev: PointerEvent): void => {
          width = setRailWidth(ev.clientX);
          fitDeck();
        };
        const up = (): void => {
          railResize.removeEventListener("pointermove", move);
          railResize.removeEventListener("pointerup", up);
          railResize.removeEventListener("pointercancel", up);
          railResize.removeAttribute("data-dragging");
          persistRail(RAIL_WIDTH_KEY, String(width));
        };
        railResize.addEventListener("pointermove", move);
        railResize.addEventListener("pointerup", up);
        railResize.addEventListener("pointercancel", up);
      });
    }
  }
  fillRailThumbs();
  fitDeck();
  render();
  showMotion(videoMode ? "hold" : "final");
  // biome-ignore lint/complexity/useLiteralKeys: video recorder looks up window["dekGo"]
  window["dekGo"] = go;
  // The video recorder seeks slide scripts the way it seeks Web Animations.
  // biome-ignore lint/complexity/useLiteralKeys: video recorder looks up window["dekMotion"]
  window["dekMotion"] = {
    duration: () => motion.duration(),
    seek: (t: number) => motion.seek(t),
  };

  let startRehearse: (() => Promise<void>) | undefined;
  if (rehearseMode) {
    const timelinePath = withDeckPrefix(location.pathname, "/voice/timeline.json");
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
        schedule: playbackSchedule(timeline),
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
  window["dekLive"] = async (raw: unknown) => {
    let event = raw as Parameters<typeof applyLiveEvent>[0];
    if (!event || typeof event !== "object" || !("type" in event)) {
      location.reload();
      return;
    }
    if (event.type === "timeline") {
      await startRehearse?.();
      return;
    }
    const hydrated = await hydrateLiveEvent(event, location.pathname);
    if (!hydrated) {
      location.reload();
      return;
    }
    event = hydrated;
    const current = slides[pos.slideIndex];
    const shown = current ? stepValuesForBeat(current.beats, pos.beatIndex) : new Set<string>();
    if (applyLiveEvent(event, liveHost, { shown }).reload) {
      location.reload();
      return;
    }
    fillRailThumbs();
    render();
    showMotion("final");
  };
}
