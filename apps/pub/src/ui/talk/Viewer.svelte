<script lang="ts">
  import { slideCount } from "../../lib/i18n.ts";
  import { useApp } from "../app.ts";
  import Icon from "../Icon.svelte";
  import { toast } from "../toast.svelte.ts";
  import type { DeckLink } from "./deck-link.svelte.ts";

  let {
    src,
    title,
    url,
    slugs,
    link,
    frame = $bindable(),
    canComment = false,
    oncommentslide,
    onpickcancel,
  }: {
    src: string;
    title: string;
    url: string;
    slugs: readonly string[];
    link: DeckLink;
    frame?: HTMLIFrameElement;
    canComment?: boolean;
    oncommentslide?: (slug: string) => void;
    onpickcancel?: () => void;
  } = $props();

  const { lang, t } = useApp();
  let stage: HTMLDivElement | undefined = $state();
  const total = $derived(link.ready ? link.slides.length : slugs.length);
  const ratio = $derived(link.size.width / link.size.height);
  const currentSlug = $derived(link.current?.slug ?? null);
  /** The deck has the keys because someone moved there with them: the frame shows a ring. */
  let keyed = $state(false);

  $effect(() => {
    if (frame) {
      return link.attach(frame);
    }
  });

  /** Hands the keys to the deck, as a click inside it would. The page does not scroll. */
  export function focusDeck() {
    keyed = document.activeElement?.matches(":focus-visible") ?? false;
    frame?.focus({ preventScroll: true });
  }

  function fullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      stage?.requestFullscreen?.().catch(() => {});
    }
  }

  async function copySlideLink() {
    const slug = currentSlug ?? slugs[0] ?? "";
    try {
      await navigator.clipboard.writeText(`${url}#${slug}`);
      toast(t("talk.linkCopied"));
    } catch {
      toast(`${url}#${slug}`);
    }
  }

  function readScript(event: MouseEvent) {
    event.preventDefault();
    document.getElementById("dek-script")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
</script>

<section class="viewer" style:--ratio={ratio} aria-label={t("talk.viewerTitle", { title })}>
  <div class="stage" bind:this={stage} class:keyed class:picking={link.picking}>
    <iframe
      bind:this={frame}
      {src}
      title={t("talk.viewerTitle", { title })}
      sandbox="allow-scripts allow-same-origin allow-popups"
      allow="fullscreen"
      referrerpolicy="no-referrer"
      onblur={() => (keyed = false)}
    ></iframe>
    {#if link.picking}
      <div class="pick-hint" role="status">
        <Icon name="crosshair" size={14} />
        <span class="pick-text-fine">{t("comment.pickHint")}</span>
        <span class="pick-text-touch">{t("comment.pickHintTouch")}</span>
        <button
          type="button"
          onclick={() => {
            link.pick(false);
            onpickcancel?.();
          }}>{t("comment.cancelPick")}</button
        >
      </div>
    {/if}
  </div>
  <div class="bar">
    <div class="nav">
      <button
        type="button"
        class="tool"
        aria-label={t("talk.prev")}
        title={t("talk.prev")}
        disabled={!link.ready || (link.current?.index ?? 0) <= 0}
        onclick={() => link.step(-1)}
      >
        <Icon name="chevron-left" />
      </button>
      <span class="position num" aria-live="polite">
        {#if link.ready && link.current}
          <span class="visually-hidden">{t("talk.position", { n: link.current.index + 1, total })}</span>
          <span aria-hidden="true">{link.current.index + 1}<span class="sep">/</span>{total}</span>
        {:else}
          <span>{slideCount(lang, total)}</span>
        {/if}
      </span>
      <button
        type="button"
        class="tool"
        aria-label={t("talk.next")}
        title={t("talk.next")}
        disabled={!link.ready || (link.current?.index ?? 0) >= total - 1}
        onclick={() => link.step(1)}
      >
        <Icon name="chevron-right" />
      </button>
    </div>
    <div class="actions">
      {#if canComment && link.ready && currentSlug}
        <button type="button" class="tool wide hide-sm" onclick={() => currentSlug && oncommentslide?.(currentSlug)}>
          <Icon name="message" />{t("comment.onSlide")}
        </button>
      {/if}
      <button type="button" class="tool hide-sm" aria-label={t("talk.copySlideLink")} title={t("talk.copySlideLink")} onclick={copySlideLink}>
        <Icon name="link" />
      </button>
      <button type="button" class="tool" aria-label={t("talk.fullscreen")} title={t("talk.fullscreen")} onclick={fullscreen}>
        <Icon name="fullscreen" />
      </button>
      <a class="tool wide read hide-sm" href="#dek-script" onclick={readScript}>
        {t("talk.read")}<Icon name="arrow-down" />
      </a>
    </div>
  </div>
</section>

<style>
  /* The stage and its bar share one width, and the page's left edge: the header's, the title's
     and the article's. A window too short for the slide narrows it from the right. */
  .viewer {
    --stage-width: min(100%, calc((100dvh - var(--header-height) - 56px - 48px) * var(--ratio)));
    max-width: var(--container);
    margin: 0 auto;
    padding: var(--space-4) var(--page-gutter) 0;
  }
  .stage {
    position: relative;
    width: var(--stage-width);
    min-width: min(100%, 320px);
    aspect-ratio: var(--ratio);
    border-radius: var(--radius-md);
    background: var(--gray-1000);
    box-shadow: 0 0 0 1px var(--border);
    overflow: hidden;
  }
  .stage:fullscreen {
    width: 100%;
    border-radius: 0;
    box-shadow: none;
    background: #000;
  }
  iframe {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    border: 0;
    display: block;
    background: transparent;
    color-scheme: normal;
  }
  .stage.keyed {
    box-shadow:
      0 0 0 1px var(--border),
      0 0 0 calc(var(--focus-offset) + var(--focus-width) + 1px) var(--focus);
  }
  .picking {
    box-shadow:
      0 0 0 2px var(--accent),
      0 0 0 6px var(--accent-subtle);
  }
  .pick-hint {
    position: absolute;
    top: 12px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: 6px 6px 6px 12px;
    border-radius: var(--radius-full);
    background: var(--surface-raised);
    color: var(--text);
    box-shadow: var(--shadow-md);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    white-space: nowrap;
    animation: drop var(--dur-base) var(--ease-out);
  }
  .pick-hint :global(svg) {
    color: var(--accent);
  }
  .pick-hint button {
    height: 28px;
    padding: 0 10px;
    border: 0;
    border-radius: var(--radius-full);
    background: var(--bg-subtle);
    color: var(--text);
    font-size: var(--text-sm);
    cursor: pointer;
  }
  .pick-hint button:hover {
    background: var(--bg-active);
  }
  .pick-text-touch {
    display: none;
  }
  @media (pointer: coarse) {
    .pick-text-fine {
      display: none;
    }
    .pick-text-touch {
      display: inline;
    }
  }
  .bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    width: var(--stage-width);
    min-width: min(100%, 320px);
    height: 48px;
    margin-top: var(--space-1);
  }
  .nav,
  .actions {
    display: flex;
    align-items: center;
    gap: 2px;
  }
  /* The first and last glyphs, not their buttons, meet the stage's edges. */
  .nav {
    margin-left: -10px;
  }
  .actions {
    margin-right: -10px;
  }
  .position {
    min-width: 64px;
    padding: 0 4px;
    color: var(--text-muted);
    font-size: var(--text-sm);
    text-align: center;
    white-space: nowrap;
  }
  .sep {
    margin: 0 0.35em;
    color: var(--text-faint);
  }
  .tool {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-width: 36px;
    height: 36px;
    padding: 0;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-muted);
    font-size: var(--text-md);
    font-weight: var(--weight-medium);
    text-decoration: none;
    cursor: pointer;
    transition:
      background-color var(--dur-instant) var(--ease-out),
      color var(--dur-instant) var(--ease-out);
  }
  .tool.wide {
    padding: 0 10px;
  }
  .tool:hover:not(:disabled) {
    background: var(--bg-subtle);
    color: var(--text);
  }
  .tool:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .read {
    color: var(--text);
  }
  @media (max-width: 767px) {
    .viewer {
      --stage-width: 100%;
      padding: 0;
    }
    .stage {
      border-radius: 0;
      box-shadow: none;
    }
    .bar {
      height: 44px;
      padding: 0 calc(var(--page-gutter) - 14px);
      border-bottom: 1px solid var(--border);
      margin-top: 0;
    }
    .nav {
      margin-left: 0;
    }
    .actions {
      margin-right: 0;
    }
    .tool {
      min-width: 44px;
      height: 44px;
    }
    .hide-sm {
      display: none;
    }
  }
  @keyframes drop {
    from {
      opacity: 0;
      transform: translate(-50%, -6px);
    }
  }
</style>
