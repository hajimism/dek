<script lang="ts">
  // A slide's picture at the size of the window: the article's figures stay at the width of the
  // text, and a click on one opens it here. A click anywhere, or Esc, closes it.

  import Icon from "../../../../../common/ui/icon.svelte";
  import { useApp } from "../../../../../shell/use-app.ts";

  type Shown = { src: string; title: string; n: number; total: number; lang: string };

  let { total }: { total: number } = $props();
  const { t } = useApp();

  let dialog: HTMLDialogElement | undefined = $state();
  let shown: Shown | null = $state(null);
  let opener: HTMLElement | null = null;

  export function show(slide: { picture?: string | null; title: string }, index: number, lang = ""): void {
    if (!slide.picture || !dialog) {
      return;
    }
    opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    shown = { src: slide.picture, title: slide.title, n: index + 1, total, lang };
    dialog.showModal();
  }

  function close(): void {
    dialog?.close();
  }

  function closed(): void {
    shown = null;
    opener?.focus();
    opener = null;
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<dialog
  bind:this={dialog}
  class="zoom"
  aria-label={shown ? `${shown.n} / ${shown.total} · ${shown.title}` : undefined}
  onclick={close}
  onclose={closed}
>
  {#if shown}
    <figure>
      <img src={shown.src} alt={shown.title} />
      <figcaption>
        <span class="num">{shown.n} / {shown.total}</span>
        <span lang={shown.lang || undefined}>{shown.title}</span>
      </figcaption>
    </figure>
    <button type="button" class="close" aria-label={t("talk.closeZoom")} onclick={close}>
      <Icon name="x" size={16} />
    </button>
  {/if}
</dialog>

<style>
  .zoom {
    width: 100vw;
    max-width: 100vw;
    height: 100dvh;
    max-height: 100dvh;
    margin: 0;
    padding: var(--space-6) var(--gutter);
    border: 0;
    background: transparent;
    cursor: zoom-out;
  }
  .zoom::backdrop {
    background: rgb(17 17 16 / 0.86);
  }
  .zoom[open] {
    display: grid;
    place-items: center;
    animation: in var(--dur-base) var(--ease-out);
  }
  figure {
    display: grid;
    gap: var(--space-3);
    margin: 0;
    max-width: min(1600px, 100%);
  }
  img {
    display: block;
    width: auto;
    max-width: 100%;
    max-height: calc(100dvh - 120px);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg);
  }
  figcaption {
    display: flex;
    gap: var(--space-3);
    color: rgb(255 255 255 / 0.8);
    font-size: var(--text-sm);
  }
  .num {
    font-variant-numeric: tabular-nums;
    color: rgb(255 255 255 / 0.55);
  }
  .close {
    position: fixed;
    top: calc(env(safe-area-inset-top, 0px) + var(--space-4));
    right: var(--space-4);
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    border: 0;
    border-radius: var(--radius-full);
    background: rgb(255 255 255 / 0.12);
    color: #fff;
    cursor: pointer;
  }
  .close:hover {
    background: rgb(255 255 255 / 0.22);
  }
  @keyframes in {
    from {
      opacity: 0;
      transform: scale(0.98);
    }
  }
</style>
