<script lang="ts">
  // The column beside the article, on a wide screen: the slides as a table of contents, the
  // talk's details, and for a reader of the review its open threads and the way into it, full
  // screen beside the slide.
  import { formatDate, slideCount } from "../../../../../common/i18n.ts";
  import Button from "../../../../../common/ui/button.svelte";
  import { useApp } from "../../../../../shell/use-app.ts";
  import SlideToc from "./slide-toc.svelte";

  let {
    slides,
    current,
    author,
    date,
    version,
    review,
    onslide,
    onreview,
  }: {
    slides: ReadonlyArray<{ slug: string; title: string }>;
    current: string | null;
    author: string;
    date: string | null;
    version: number;
    /** The review's open threads, for a reader of it; null for anyone else. */
    review: { open: number } | null;
    onslide: (slug: string) => void;
    onreview: () => void;
  } = $props();

  const { lang, t } = useApp();
</script>

<div class="side">
  {#if review}
    <section class="block review" aria-labelledby="dek-side-review">
      <h2 id="dek-side-review">{t("side.review")}</h2>
      <p>{review.open === 1 ? t("side.openThread") : t("side.openThreads", { n: review.open })}</p>
      <Button variant="secondary" size="sm" icon="message" onclick={onreview}>{t("side.openReview")}</Button>
    </section>
  {/if}
  <section class="block" aria-labelledby="dek-side-slides">
    <h2 id="dek-side-slides">{t("side.slides")}</h2>
    <SlideToc {slides} {current} {onslide} />
  </section>
  <section class="block" aria-labelledby="dek-side-details">
    <h2 id="dek-side-details">{t("side.details")}</h2>
    <dl>
      <dt>{t("side.author")}</dt>
      <dd>{author}</dd>
      {#if date}
        <dt>{t("side.date")}</dt>
        <dd><time datetime={date}>{formatDate(lang, date)}</time></dd>
      {/if}
      <dt>{t("side.version")}</dt>
      <dd class="num">v{version}</dd>
      <dt>{t("side.length")}</dt>
      <dd>{slideCount(lang, slides.length)}</dd>
    </dl>
  </section>
</div>

<style>
  .side {
    position: sticky;
    top: calc(var(--header-height) + var(--space-4));
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
    max-height: calc(100dvh - var(--header-height) - var(--space-8));
    overflow-y: auto;
    padding-bottom: var(--space-4);
  }
  .block {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  h2 {
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .review {
    padding: var(--space-3);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface);
  }
  .review p {
    font-size: var(--text-sm);
  }
  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: var(--space-1) var(--space-3);
    font-size: var(--text-sm);
  }
  dt {
    color: var(--text-muted);
  }
</style>
