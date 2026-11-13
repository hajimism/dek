<script lang="ts">
  // The deck full screen: dek.pub's own frame around it, not the deck's iframe alone, so a header
  // and the review panel sit with the slide. The header shows on demand and hides when idle; in
  // review mode it stays, and the panel opens beside a smaller slide, or under it on a phone.
  // Where the browser has no full screen for an element (iPhone Safari), the frame fills the page.
  import type { Snippet } from "svelte";
  import Icon from "../../../../../common/ui/icon.svelte";
  import { useApp } from "../../../../../shell/use-app.ts";

  let {
    title,
    author,
    position = null,
    reviewCount = null,
    immersive = $bindable(false),
    reviewing = $bindable(false),
    stage,
    panel,
    extra,
  }: {
    title: string;
    author: string;
    /** "3 / 18", once the deck has said where it stands. */
    position?: string | null;
    /** Open review threads, for a reader of them; null hides the review button. */
    reviewCount?: number | null;
    immersive?: boolean;
    reviewing?: boolean;
    stage: Snippet;
    panel?: Snippet;
    /** More of the header, such as the like. */
    extra?: Snippet;
  } = $props();

  const { t } = useApp();
  const IDLE_MS = 3000;
  let root: HTMLDivElement | undefined = $state();
  /** Full screen by filling the page, where the browser gives none. */
  let filling = $state(false);
  let headShown = $state(false);
  let idle: ReturnType<typeof setTimeout> | undefined;

  /** Show the header, and hide it again after a while unless the review keeps it. */
  function showHead() {
    headShown = true;
    clearTimeout(idle);
    idle = setTimeout(() => {
      headShown = false;
    }, IDLE_MS);
  }

  /**
   * Fill the page at once, then ask for full screen: a browser that grants it moves the frame
   * there, and one that refuses or never answers, as some embedded views do, leaves it filling.
   */
  export function enter(review = false) {
    reviewing = review && reviewCount !== null;
    immersive = true;
    filling = true;
    showHead();
    if (root?.requestFullscreen && document.fullscreenEnabled) {
      root.requestFullscreen().catch(() => {});
    }
  }

  export function exit() {
    if (document.fullscreenElement === root) {
      document.exitFullscreen().catch(() => {});
    }
    filling = false;
    immersive = false;
    reviewing = false;
  }

  /** Review mode on or off, as the button and the `c` key do; only while full screen. */
  export function toggleReview() {
    if (!immersive || reviewCount === null) {
      return;
    }
    reviewing = !reviewing;
    showHead();
  }

  $effect(() => {
    const onChange = () => {
      if (document.fullscreenElement === root) {
        filling = false;
      } else if (immersive && !filling) {
        // The browser left full screen itself, on Escape: so does the frame.
        immersive = false;
        reviewing = false;
      }
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  });

  function onkeydown(event: KeyboardEvent) {
    if (!immersive || event.defaultPrevented) {
      return;
    }
    const target = event.target as HTMLElement | null;
    if (target?.closest("input, textarea, select, [contenteditable]")) {
      return;
    }
    if (event.key === "Escape" && filling) {
      event.preventDefault();
      exit();
    } else if (event.key.toLowerCase() === "c" && !event.altKey && !event.ctrlKey && !event.metaKey && !event.repeat) {
      event.preventDefault();
      toggleReview();
    }
  }
</script>

<svelte:window {onkeydown} />

<div
  bind:this={root}
  class="theater"
  class:immersive
  class:filling
  class:reviewing
  data-immersive={immersive ? (filling ? "fill" : "fullscreen") : undefined}
>
  {#if immersive}
    <!-- Over the slide's top edge, where the pointer or a tap calls the header back. -->
    <div class="hot" aria-hidden="true" onpointermove={showHead} onpointerdown={showHead}></div>
    <header class="head" class:shown={headShown || reviewing}>
      <div class="who">
        <span class="title">{title}</span>
        <span class="author">{author}</span>
      </div>
      <div class="tools">
        {#if position}<span class="position num">{position}</span>{/if}
        {@render extra?.()}
        {#if reviewCount !== null}
          <button type="button" class="tool" aria-pressed={reviewing} onclick={toggleReview}>
            <Icon name="message" />{t("talk.comments")}<span class="num">{reviewCount}</span>
          </button>
        {/if}
        <button type="button" class="tool" aria-label={t("talk.exitFullscreen")} title={t("talk.exitFullscreen")} onclick={exit}>
          <Icon name="x" />
        </button>
      </div>
    </header>
  {/if}
  <div class="main">
    <div class="stage-area">{@render stage()}</div>
    {#if immersive && reviewing && panel}
      <aside class="panel" aria-label={t("talk.comments")}>{@render panel()}</aside>
    {/if}
  </div>
</div>

<style>
  .theater.immersive {
    position: relative;
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    background: #000;
    color: #fff;
  }
  .theater.filling {
    position: fixed;
    inset: 0;
    z-index: 100;
    height: 100dvh;
  }
  .main {
    display: contents;
  }
  .immersive .main {
    position: relative;
    display: flex;
    flex: 1;
    min-height: 0;
  }
  .immersive .stage-area {
    flex: 1;
    min-width: 0;
    container-type: size;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .immersive.reviewing .main {
    padding-top: 52px;
  }
  .panel {
    flex: none;
    width: min(380px, 40vw);
    overflow: auto;
    padding: var(--space-4);
    background: var(--surface);
    color: var(--text);
    border-left: 1px solid var(--border);
  }
  .hot {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 28px;
    z-index: 2;
  }
  .head {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    z-index: 3;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    height: 52px;
    padding: 0 var(--space-4);
    background: rgba(0, 0, 0, 0.72);
    backdrop-filter: blur(8px);
    opacity: 0;
    transform: translateY(-100%);
    pointer-events: none;
    transition:
      opacity var(--dur-base) var(--ease-out),
      transform var(--dur-base) var(--ease-out);
  }
  .head.shown,
  .head:hover {
    opacity: 1;
    transform: none;
    pointer-events: auto;
  }
  .who {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    min-width: 0;
  }
  .title {
    overflow: hidden;
    font-weight: var(--weight-semibold);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .author,
  .position {
    color: rgba(255, 255, 255, 0.7);
    font-size: var(--text-sm);
    white-space: nowrap;
  }
  .tools {
    display: flex;
    flex: none;
    align-items: center;
    gap: var(--space-1);
  }
  .tools :global(.like),
  .tool {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 36px;
    padding: 0 10px;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: rgba(255, 255, 255, 0.85);
    font-size: var(--text-sm);
    cursor: pointer;
  }
  .tool:hover,
  .tools :global(.like:hover) {
    background: rgba(255, 255, 255, 0.12);
    color: #fff;
  }
  .tool[aria-pressed="true"] {
    background: rgba(255, 255, 255, 0.18);
    color: #fff;
  }
  @media (max-width: 767px) {
    .immersive .main {
      flex-direction: column;
    }
    .panel {
      width: auto;
      max-height: 55%;
      border-left: 0;
      border-top: 1px solid var(--border);
      border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    }
    .author {
      display: none;
    }
  }
</style>
