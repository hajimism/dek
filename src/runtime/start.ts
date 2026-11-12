/// <reference lib="dom" />

import { PAGE_ID, readPageConfig } from "../core/page.ts";
import { deckStops, moveTarget, positionsEqual } from "../core/position.ts";
import type { PresenterSlide } from "../core/presenter-state.ts";
import { logicalSize } from "../core/size.ts";
import type { Position } from "../core/step.ts";
import { createDeckControl } from "./deck-control.ts";
import type { CreateDevLine } from "./dev-line.ts";
import { createEmbed, type Embed } from "./embed.ts";
import { bindInput } from "./input.ts";
import { createLaserView, type LaserView } from "./laser-view.ts";
import { createNavigator } from "./navigator.ts";
import { breakPhrases } from "./phrases.ts";
import { createPluginHost } from "./plugins.ts";
import { createPresenterView } from "./presenter-view.ts";
import { createRailView } from "./rail-view.ts";
import { deckChannelName } from "./routes.ts";
import { createStage } from "./stage.ts";

/**
 * Start the player on the page. The dev server's player passes `createDevLine`, its line to the
 * server; a file that stands alone has no server, and its player is built without one.
 */
export function startPlayer(createDevLine?: CreateDevLine): void {
  const dataEl = document.getElementById(PAGE_ID.data);
  if (!dataEl?.textContent) {
    return;
  }
  // Before anything clones a slide, so the rail and the next slide break as the stage does.
  breakPhrases(document);
  const page = readPageConfig(document.body);
  const framed = window.parent !== window;
  const slides = JSON.parse(dataEl.textContent) as PresenterSlide[];
  const deck = deckStops(slides);
  const stage = createStage({ slides, deck, videoMode: page.mode === "video" });
  const presenter = createPresenterView({ slides, deck, stage, mode: page.mode });

  function fitAll(): void {
    stage.fit();
    presenter.fit();
    rail.fit();
    embed?.layout();
  }

  /** Draw every view at `pos`. */
  function render(pos: Position): void {
    stage.render(pos);
    presenter.render(pos);
    rail.markCurrent(pos.slideIndex);
    marks?.render(pos);
    plugins.render(pos);
    embed?.layout();
  }

  /**
   * The first key or move takes the key hint away. Removing it also drops its animation, which
   * the first move would otherwise wait on before it settles.
   */
  function dismissKeyHint(): void {
    document.getElementById(PAGE_ID.hint)?.remove();
  }

  const dev = createDevLine?.({
    page,
    go: (position, origin) => nav.go(position, origin),
    target: () => nav.target(),
    position: () => nav.position(),
  });
  const control = createDeckControl({
    go: (next, origin) => nav.go(next, origin),
    ...(dev ? { rehearse: dev.rehearse } : {}),
  });

  // A video shows the talk as narrated; nobody points at it.
  const laser: LaserView | undefined =
    page.mode === "video"
      ? undefined
      : createLaserView({
          current: () => nav.position().slideIndex,
          send: (pointer) => nav.point(pointer),
        });

  const nav = createNavigator({
    deck,
    channelName: deckChannelName(
      page.deck,
      deck.map((slide) => slide.slug),
    ),
    ...(dev ? { connect: dev.connect } : {}),
    present: stage.present,
    hurry: stage.hurry,
    beforeMove: dismissKeyHint,
    framed,
    onMove: (from, to, origin) => {
      render(to);
      if (from.slideIndex !== to.slideIndex) {
        stage.announce(to);
        laser?.sync();
      }
      // A hashchange echoing this same position must not cut a running animation short.
      if (!positionsEqual(from, to)) {
        stage.showMove(from, to);
      }
      embed?.moved(from, to, origin === "embed" ? "embed" : "reader");
    },
    afterMove: () => {
      presenter.startClock();
      // A move that another is queued behind has not settled; the last one says where it stands.
      if (positionsEqual(nav.target(), nav.position())) {
        plugins.settled(nav.position());
      }
    },
    route: (next) => control.request(next, "remote"),
    ...(laser ? { onPointer: laser.receive } : {}),
  });

  const marks = dev?.marks;

  // A page that frames the deck drives it through the embed API; one standing alone has no parent.
  const embed: Embed | undefined = framed
    ? createEmbed({
        deck: page.deck,
        size: page.size ?? logicalSize(),
        slides,
        parent: window.parent,
        position: () => nav.position(),
        go: (next) => control.request(next, "embed"),
      })
    : undefined;

  // Plugins' pages run after the player and call window.dek.plugin, which this defines.
  const plugins = createPluginHost({
    deck: page.deck,
    slides,
    position: () => nav.position(),
  });

  const rail = createRailView({
    slides,
    stage,
    onPick: (slideIndex) => control.request({ slideIndex, beatIndex: 0 }, "local"),
    onResize: fitAll,
    framed,
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

  // A framing page shows the slide alone; the keys are its to tell of, if it wants them told.
  if (framed) {
    dismissKeyHint();
  }
  rail.fill();
  fitAll();
  render(nav.position());
  // A hash that named a beat past the slide's last now says where the deck opened.
  nav.writeHash("replace");
  stage.showMotion(nav.position(), page.mode === "video" ? "hold" : "final");
  embed?.ready(nav.position());
  // biome-ignore lint/complexity/useLiteralKeys: video recorder looks up window["dekGo"]
  window["dekGo"] = (next) => nav.go(next, "capture");
  // The video recorder seeks slide scripts the way it seeks Web Animations.
  // biome-ignore lint/complexity/useLiteralKeys: video recorder looks up window["dekMotion"]
  window["dekMotion"] = stage.motion;

  // Whatever a live update changed, drawing the beat again puts it back as it stood.
  dev?.start(() => {
    const pos = nav.position();
    rail.fill();
    render(pos);
    stage.showMotion(pos, "final");
  });
}
