/// <reference lib="dom" />

import {
  nextPresenterTitle,
  type PresenterSlide,
  presenterState,
} from "../core/presenter-state.ts";
import { type Position, stepKey, stepValuesForBeat } from "../core/step.ts";
import { playbackSchedule, type Timeline } from "../core/timeline.ts";
import { formatClock } from "../core/timing.ts";
import { visualClone } from "./clone.ts";
import { deckFitTransform } from "./fit.ts";
import { applyIncomingPosition, createGuardedGo } from "./go.ts";
import { applyLiveEvent, hydrateLiveEvent, slideSelector } from "./live.ts";
import { documentLiveHost } from "./live-host.ts";
import { createMotion, drawAtEnd, type MotionMode, type SlideModule } from "./motion.ts";
import {
  clampPosition,
  formatHash,
  hashChangeTarget,
  historyMode,
  parsePosition,
  positionFromHash,
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
  pageStorage,
  RAIL_VISIBLE_KEY,
  RAIL_WIDTH_KEY,
  RAIL_WIDTH_STEP,
  readStoredRailVisible,
  readStoredRailWidth,
} from "./rail.ts";
import { createRehearseDriver, type RehearseDriver } from "./rehearse.ts";
import { deckChannelName, liveTokenQuery, withDeckPrefix } from "./routes.ts";
import { type ViewTransitionLike, waitForPlaybackSettle } from "./settle.ts";
import { createPositionSocket, type PositionSocket } from "./socket.ts";
import {
  advance,
  applyIsShown,
  applyMorphNames,
  clearMorphNames,
  isInteractive,
  isLetterKey,
  isTextEntry,
  keyToMove,
  moveTarget,
  pointerMove,
  shouldUseViewTransition,
} from "./step.ts";

const dataEl = document.getElementById("dek-data");
if (dataEl?.textContent) {
  const slides = JSON.parse(dataEl.textContent) as PresenterSlide[];
  const slugs = slides.map((slide) => slide.slug);
  const beatCounts = slides.map((slide) => slide.beats.length);
  const hashSlides = slides.map((slide) => ({ slug: slide.slug, beats: slide.beats.length }));
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
  // One channel per deck: two decks' built files open side by side must not drive each other.
  const channel = new BroadcastChannel(deckChannelName(document.body.dataset.deck, slugs));
  /** What is on screen. */
  let pos = positionFromHash(location.hash, hashSlides);
  /**
   * Where the deck is headed: `pos` once the moves asked for have run. Keys step from here, so
   * every press counts even while a transition is still playing.
   */
  let target = pos;
  let startedAt: number | undefined;
  const elapsedEl = document.getElementById("dek-elapsed");
  const budgetEl = document.getElementById("dek-budget");
  const talkBudget = totalBudgetSeconds(slides);
  let remote: PositionSocket | undefined;
  const rehearseMode = new URLSearchParams(location.search).has("rehearse");
  let rehearseDriver: RehearseDriver | undefined;
  // Only the dev server has a socket to follow; a built file on a static host must not dial one.
  if (document.body.dataset.live === "true") {
    const wsPath = withDeckPrefix(location.pathname, "/ws");
    const wsUrl = `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}${wsPath}${liveTokenQuery(document.body.dataset.liveToken)}`;
    remote = createPositionSocket({
      connect: () => new WebSocket(wsUrl),
      onPosition: (next) => applyRemotePosition(next),
      setTimer: (fn, ms) => window.setTimeout(fn, ms),
      clearTimer: (id) => window.clearTimeout(id),
    });
    // A page that is really going away must not dial back in; one kept for Back reconnects.
    window.addEventListener("pagehide", (event) => {
      if (!event.persisted) {
        remote?.close();
      }
    });
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
      pageStorage()?.setItem(key, value);
    } catch {
      // file:// or private mode may reject storage
    }
  }

  function setRailWidth(px: number): number {
    const width = clampRailWidth(px);
    document.documentElement.style.setProperty("--dek-rail-w", `${width}px`);
    document.getElementById("dek-rail-resize")?.setAttribute("aria-valuenow", String(width));
    return width;
  }

  function toggleFullscreen(): void {
    if (document.fullscreenElement) {
      void document.exitFullscreen?.().catch(() => undefined);
    } else {
      void document.documentElement.requestFullscreen?.().catch(() => undefined);
    }
  }

  function prefersReducedMotion(): boolean {
    return matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  /** Tell a screen reader the slide changed; beats within a slide pass quietly. */
  function announceSlide(): void {
    const el = document.getElementById("dek-announce");
    const slide = slides[pos.slideIndex];
    if (el && slide) {
      el.textContent = `Slide ${pos.slideIndex + 1} of ${slides.length}: ${slide.title}`;
    }
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
    if (prefersReducedMotion()) {
      return "final";
    }
    const counts = slides.map((slide) => slide.beats.length);
    const stepped = advance(from, counts);
    return stepped && positionsEqual(stepped, to) ? "animate" : "final";
  }

  function drawStill(clone: HTMLElement, slide: PresenterSlide, index: number): void {
    drawAtEnd(slideModules()[slide.slug], clone, index, stepKey(slide.beats, index));
  }

  let printing = false;

  /**
   * Print gives each slide a page at its last beat, as `dek pdf` does, so each slide's script
   * draws that beat's end the way the PDF page draws it. Once printed, the stage draws its own
   * beat again. The browser tells of a print twice (beforeprint and the print media query), and
   * a PDF export only the second way; each change is drawn once.
   */
  function setPrinting(on: boolean): void {
    if (on === printing) {
      return;
    }
    printing = on;
    if (!on) {
      render();
      showMotion("final");
      return;
    }
    motion.stop();
    for (const slide of slides) {
      const el = slideEl(slide.slug);
      if (el) {
        const last = Math.max(slide.beats.length - 1, 0);
        applyIsShown([...el.querySelectorAll("[data-step]")], stepValuesForBeat(slide.beats, last));
        drawStill(el, slide, last);
      }
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
      const clone = source ? visualClone(source) : undefined;
      if (!clone) {
        frame.replaceChildren();
        continue;
      }
      const stage = document.createElement("div");
      stage.className = "dek-thumb-stage";
      stage.style.width = `${width}px`;
      stage.style.height = `${height}px`;
      stage.append(clone);
      frame.replaceChildren(stage);
      // Drawn once in the document, so a script that measures its slide gets real boxes.
      drawStill(clone, slide, 0);
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
    const clone = source ? visualClone(source) : undefined;
    if (!clone || !deckEl) {
      stage.replaceChildren();
      return;
    }
    applyIsShown(
      [...clone.querySelectorAll("[data-step]")],
      stepValuesForBeat(nextSlide.beats, nextPos.beatIndex),
    );
    const frame = document.createElement("div");
    frame.className = "dek-preview-frame";
    frame.style.width = `${deckEl.offsetWidth || 1280}px`;
    frame.style.height = `${deckEl.offsetHeight || 720}px`;
    frame.append(clone);
    stage.replaceChildren(frame);
    drawStill(clone, nextSlide, nextPos.beatIndex);
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
  }

  /**
   * Write `pos` to the URL without a hashchange, so the handler only ever hears the reader:
   * a typed hash, Back, or Forward.
   */
  function writeHash(mode: "push" | "replace"): void {
    const hash = formatHash(pos, slugs);
    if (!hash || location.hash === hash) {
      return;
    }
    try {
      history[mode === "push" ? "pushState" : "replaceState"](null, "", hash);
    } catch {
      // A browser that refuses history on this URL still takes a hash; its echo matches `target`.
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

  /**
   * Where a move came from. Local moves are published to peers; remote ones arrived from one;
   * a hash move came from the URL, which already holds its history entry.
   */
  type GoOrigin = "local" | "remote" | "hash";
  type GoRequest = { position: Position; origin: GoOrigin };

  /** Tell the other windows and the server where the deck is headed. */
  function publishPosition(position: Position): void {
    channel.postMessage(position);
    remote?.publish(position);
  }

  let inFlight: { skipTransition(): void } | undefined;

  /** Cut the running move short: a newer one is waiting, and the presenter should not. */
  function hurry(): void {
    if (videoMode) {
      return;
    }
    inFlight?.skipTransition();
    for (const animation of document.getAnimations()) {
      const end = animation.effect?.getComputedTiming().endTime;
      if (animation.playState === "running" && typeof end === "number" && Number.isFinite(end)) {
        animation.finish();
      }
    }
  }

  const runGo = createGuardedGo(
    async ({ position: next, origin }: GoRequest) => {
      dismissKeyHint();
      const apply = (): void => {
        const from = pos;
        pos = next;
        render();
        writeHash(origin === "hash" ? "replace" : historyMode(from, next));
        if (from.slideIndex !== next.slideIndex) {
          announceSlide();
        }
        // A hashchange echoing this same position must not cut a running animation short.
        if (!positionsEqual(from, next)) {
          showMotion(motionModeFor(from, next));
        }
      };
      let viewTransition: ViewTransitionLike | undefined;
      if (
        shouldUseViewTransition(pos.slideIndex, next.slideIndex) &&
        "startViewTransition" in document &&
        !prefersReducedMotion()
      ) {
        const fromEl = slideEl(slides[pos.slideIndex]?.slug);
        if (fromEl) {
          applyMorphNames([...fromEl.querySelectorAll<HTMLElement>("[data-morph]")]);
        }
        const started = document.startViewTransition(apply);
        viewTransition = started;
        inFlight = started;
      } else {
        apply();
      }
      try {
        await waitForPlaybackSettle({
          animations: [...document.getAnimations()],
          viewTransition,
        });
      } finally {
        inFlight = undefined;
      }
      ensureTimer();
    },
    { onQueue: hurry },
  );

  /**
   * Move to `next`. A local move is published at once, so a second window follows the key press
   * rather than the end of this window's animation. A remote one came from a peer and is not
   * sent back: a peer that had moved on would be rewound by the echo.
   */
  function go(next: Position | null | undefined, origin: GoOrigin = "local"): Promise<void> {
    if (next == null) {
      return runGo(undefined);
    }
    target = next;
    if (origin === "local") {
      publishPosition(next);
    }
    return runGo({ position: next, origin });
  }

  function applyRemotePosition(next: Position): void {
    const clamped = clampPosition(
      next,
      slides.map((slide) => ({ beats: slide.beats.length })),
    );
    if (!clamped) {
      return;
    }
    applyIncomingPosition((incoming: Position) => go(incoming, "remote"), clamped, {
      equal: positionsEqual,
      current: () => target,
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
    // Keys typed into a field on a slide are the field's.
    if (isTextEntry(event.target)) {
      return;
    }
    dismissKeyHint();
    if (isPresenterToggleKey(event)) {
      if (presenterRoot) {
        event.preventDefault();
        setPresenterOpen(!presenterOpen());
      }
      return;
    }
    if (isLetterKey(event, "f")) {
      event.preventDefault();
      toggleFullscreen();
      return;
    }
    if (isRailToggleKey(event)) {
      if (document.getElementById("dek-rail") && !presenterOpen()) {
        event.preventDefault();
        setRailOpen(!railOpen());
      }
      return;
    }
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
      const rehearseMove = keyToMove(event);
      if (!rehearseMove) {
        return;
      }
      event.preventDefault();
      const next = moveTarget(rehearseMove, pos, beatCounts);
      if (next) {
        rehearseDriver.seek(next);
      }
      return;
    }
    const move = keyToMove(event);
    if (!move) {
      return;
    }
    event.preventDefault();
    void go(moveTarget(move, target, beatCounts));
  });
  const stageEl = document.getElementById("dek-current-stage");
  if (stageEl) {
    let start: { x: number; y: number; id: number } | undefined;
    stageEl.addEventListener("pointerdown", (event) => {
      // A mouse has the keyboard beside it; touch and pen have only the screen.
      if (event.pointerType === "mouse" || isInteractive(event.target)) {
        start = undefined;
        return;
      }
      start = { x: event.clientX, y: event.clientY, id: event.pointerId };
    });
    stageEl.addEventListener("pointerup", (event) => {
      if (!start || start.id !== event.pointerId) {
        return;
      }
      const rect = stageEl.getBoundingClientRect();
      const move = pointerMove(
        {
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
          dx: event.clientX - start.x,
          dy: event.clientY - start.y,
        },
        rect,
      );
      start = undefined;
      if (move) {
        void go(moveTarget(move, target, beatCounts));
      }
    });
    stageEl.addEventListener("pointercancel", () => {
      start = undefined;
    });
  }
  window.addEventListener("hashchange", () => {
    void go(hashChangeTarget(target, location.hash, hashSlides), "hash");
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
  window.addEventListener("beforeprint", () => setPrinting(true));
  window.addEventListener("afterprint", () => setPrinting(false));
  matchMedia("print").addEventListener?.("change", (event) => setPrinting(event.matches));
  const railEl = document.getElementById("dek-rail");
  const railResize = document.getElementById("dek-rail-resize");
  if (railEl) {
    setRailWidth(readStoredRailWidth(pageStorage()));
    setRailOpen(readStoredRailVisible(pageStorage()), false);
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
      railResize.addEventListener("keydown", (event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
          return;
        }
        // The arrows resize the rail here; they must not also move the deck.
        event.preventDefault();
        event.stopPropagation();
        const now = Number(railResize.getAttribute("aria-valuenow"));
        const step = event.key === "ArrowRight" ? RAIL_WIDTH_STEP : -RAIL_WIDTH_STEP;
        persistRail(RAIL_WIDTH_KEY, String(setRailWidth(now + step)));
        fitDeck();
      });
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
  // A hash that named a beat past the slide's last now says where the deck opened.
  writeHash("replace");
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
