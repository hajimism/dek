<script lang="ts">
  // The slides by their titles, as links to their sections of the article, the one being read
  // marked. A plain click hands the slide to `onslide`, which scrolls there; a link opened in a
  // new tab, or copied, goes by its fragment.
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

  function follow(event: MouseEvent, slug: string) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    onslide(slug);
  }
</script>

<nav class="toc" aria-label={t("side.slides")}>
  <ol>
    {#each slides as slide, i (slide.slug)}
      <li>
        <a
          href="#{slide.slug}"
          aria-current={slide.slug === current ? "location" : undefined}
          onclick={(event) => follow(event, slide.slug)}
        >
          <span class="n num">{i + 1}</span>
          <span class="title">{slide.title || slide.slug}</span>
        </a>
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
  a {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    width: 100%;
    padding: 6px 8px;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-muted);
    font-size: var(--text-sm);
    line-height: var(--leading-ui);
    text-align: left;
    text-decoration: none;
  }
  a:hover {
    background: var(--bg-subtle);
    color: var(--text);
  }
  a[aria-current="location"] {
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
