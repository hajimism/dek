<script lang="ts">
  // The slides by their titles, the one on screen marked; a click moves the deck there.
  import { useApp } from "../../../../../shell/use-app.ts";

  let {
    slides,
    current,
    onslide,
  }: {
    slides: ReadonlyArray<{ slug: string; title: string }>;
    current: string | null;
    onslide: (slug: string) => void;
  } = $props();

  const { t } = useApp();
</script>

<nav class="toc" aria-label={t("side.slides")}>
  <ol>
    {#each slides as slide, i (slide.slug)}
      <li>
        <button
          type="button"
          aria-current={slide.slug === current ? "true" : undefined}
          onclick={() => onslide(slide.slug)}
        >
          <span class="n num">{i + 1}</span>
          <span class="title">{slide.title || slide.slug}</span>
        </button>
      </li>
    {/each}
  </ol>
</nav>

<style>
  ol {
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: 0;
    list-style: none;
  }
  button {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    width: 100%;
    padding: 6px 8px;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-muted);
    font-size: var(--text-sm);
    line-height: var(--leading-ui);
    text-align: left;
    cursor: pointer;
  }
  button:hover {
    background: var(--bg-subtle);
    color: var(--text);
  }
  button[aria-current="true"] {
    background: var(--accent-subtle);
    color: var(--text);
    font-weight: var(--weight-medium);
  }
  .n {
    flex: none;
    min-width: 1.5em;
    color: var(--text-faint);
    text-align: right;
  }
  .title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
