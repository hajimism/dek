/// <reference lib="dom" />

import { isLiveEvent } from "../core/live-protocol.ts";
import { PAGE_ID, readPageConfig } from "../core/page.ts";
import { deckStops, moveTarget, positionsEqual } from "../core/position.ts";
import type { PresenterSlide } from "../core/presenter-state.ts";
import type { Position } from "../core/step.ts";
import { createDeckControl } from "./deck-control.ts";
import { bindInput } from "./input.ts";
import { createLaserView, type LaserView } from "./laser-view.ts";
import { applyLiveEvent, hydrateLiveEvent } from "./live.ts";
import { documentLiveHost } from "./live-host.ts";
import { createMarksView } from "./marks-view.ts";
import { createNavigator } from "./navigator.ts";
import { createPresenterView } from "./presenter-view.ts";
import { createRailView } from "./rail-view.ts";
import { createRehearseController, fetchRehearsal } from "./rehearse.ts";
import { deckChannelName, deckUrl, liveTokenQuery } from "./routes.ts";
import { createStage } from "./stage.ts";

const dataEl = document.getElementById(PAGE_ID.data);
if (dataEl?.textContent) {
  const page = readPageConfig(document.body);
  const slides = JSON.parse(dataEl.textContent) as PresenterSlide[];
  const deck = deckStops(slides);
  const stage = createStage({ slides, deck, videoMode: page.mode === "video" });
  const presenter = createPresenterView({ slides, deck, stage, mode: page.mode });

  function fitAll(): void {
    stage.fit();
    presenter.fit();
    rail.fit();
  }

  /** Draw every view at `pos`. */
  function render(pos: Position): void {
    stage.render(pos);
    presenter.render(pos);
    rail.markCurrent(pos.slideIndex);
    marks?.render(pos);
  }

  /**
   * The first key or move takes the key hint away. Removing it also drops its animation, which
   * the first move would otherwise wait on before it settles.
   */
  function dismissKeyHint(): void {
    document.getElementById(PAGE_ID.hint)?.remove();
  }

  const rehearse = createRehearseController({
    load: () =>
      fetchRehearsal(location.pathname, {
        fetch: (input, init) => fetch(input, init),
        audio: (src) => new Audio(src),
      }),
    go: (position, origin) => nav.go(position, origin),
    current: () => nav.target(),
  });
  const control = createDeckControl({ go: (next, origin) => nav.go(next, origin), rehearse });

  // A video shows the talk as narrated; nobody points at it.
  const laser: LaserView | undefined =
    page.mode === "video"
      ? undefined
      : createLaserView({
          current: () => nav.position().slideIndex,
          send: (pointer) => nav.point(pointer),
        });

  // Only the dev server has a socket to follow; a built file on a static host must not dial one.
  const socketUrl = page.live
    ? `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}${deckUrl(location.pathname, { kind: "socket" })}${liveTokenQuery(page.liveToken)}`
    : undefined;
  const nav = createNavigator({
    deck,
    channelName: deckChannelName(
      page.deck,
      deck.map((slide) => slide.slug),
    ),
    ...(socketUrl ? { socketUrl } : {}),
    present: stage.present,
    hurry: stage.hurry,
    beforeMove: dismissKeyHint,
    onMove: (from, to) => {
      render(to);
      if (from.slideIndex !== to.slideIndex) {
        stage.announce(to);
        laser?.sync();
      }
      // A hashchange echoing this same position must not cut a running animation short.
      if (!positionsEqual(from, to)) {
        stage.showMove(from, to);
      }
    },
    afterMove: presenter.startClock,
    route: (next) => control.request(next, "remote"),
    ...(laser ? { onPointer: laser.receive } : {}),
  });

  const marks = createMarksView({
    url: `${deckUrl(location.pathname, { kind: "marks" })}${liveTokenQuery(page.liveToken)}`,
    current: () => nav.position(),
    fetch: (input, init) => fetch(input, init),
  });

  const rail = createRailView({
    slides,
    stage,
    onPick: (slideIndex) => control.request({ slideIndex, beatIndex: 0 }, "local"),
    onResize: fitAll,
  });

  function setPresenterOpen(open: boolean): void {
    presenter.setOpen(open);
    fitAll();
    render(nav.position());
  }

  bindInput({
    onKey: dismissKeyHint,
    togglePresenter: () => {
      if (!presenter.available()) {
        return false;
      }
      setPresenterOpen(!presenter.isOpen());
      return true;
    },
    toggleFullscreen: () => {
      if (document.fullscreenElement) {
        void document.exitFullscreen?.().catch(() => undefined);
      } else {
        void document.documentElement.requestFullscreen?.().catch(() => undefined);
      }
    },
    toggleRail: () => {
      if (!rail.available() || presenter.isOpen()) {
        return false;
      }
      rail.setOpen(!rail.isOpen());
      return true;
    },
    togglePlay: control.togglePlay,
    toggleLaser: () => laser?.toggle() ?? false,
    toggleMark: () => marks?.toggle() ?? false,
    pointing: () => laser?.isOn() ?? false,
    move: (move) => control.request(moveTarget(move, nav.target(), deck), "local"),
  });

  window.addEventListener("resize", fitAll);
  window.addEventListener("beforeprint", () => stage.setPrinting(true, nav.position()));
  window.addEventListener("afterprint", () => stage.setPrinting(false, nav.position()));
  matchMedia("print").addEventListener?.("change", (event) =>
    stage.setPrinting(event.matches, nav.position()),
  );

  rail.fill();
  fitAll();
  render(nav.position());
  // A hash that named a beat past the slide's last now says where the deck opened.
  nav.writeHash("replace");
  stage.showMotion(nav.position(), page.mode === "video" ? "hold" : "final");
  // biome-ignore lint/complexity/useLiteralKeys: video recorder looks up window["dekGo"]
  window["dekGo"] = (next) => nav.go(next, "capture");
  // The video recorder seeks slide scripts the way it seeks Web Animations.
  // biome-ignore lint/complexity/useLiteralKeys: video recorder looks up window["dekMotion"]
  window["dekMotion"] = stage.motion;

  const rehearseMode = new URLSearchParams(location.search).has("rehearse");
  if (rehearseMode) {
    void rehearse.load();
  }

  const liveHost = documentLiveHost();
  // Keep a string key so minify does not rename the hook liveReloadScript calls.
  // biome-ignore lint/complexity/useLiteralKeys: liveReloadScript looks up window["dekLive"]
  window["dekLive"] = async (raw: unknown) => {
    if (!isLiveEvent(raw)) {
      location.reload();
      return;
    }
    if (raw.type === "timeline") {
      if (rehearseMode) {
        await rehearse.load();
      }
      return;
    }
    const event = await hydrateLiveEvent(raw, location.pathname);
    if (!event) {
      location.reload();
      return;
    }
    if (applyLiveEvent(event, liveHost).reload) {
      location.reload();
      return;
    }
    // Whatever changed, drawing the beat again puts it back as it stood.
    const pos = nav.position();
    rail.fill();
    render(pos);
    stage.showMotion(pos, "final");
  };
}
