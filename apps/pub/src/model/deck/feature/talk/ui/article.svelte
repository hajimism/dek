<script lang="ts" module>
  import type { Quote } from "../../../../comment/quote.ts";

  export type QuoteSelection = { slug: string; quote: Quote };

  /** How many characters of `container`'s text come before (`node`, `offset`). */
  export function textOffset(container: Node, node: Node, offset: number): number {
    const range = document.createRange();
    range.selectNodeContents(container);
    range.setEnd(node, offset);
    return range.toString().length;
  }
</script>

<script lang="ts">
  import type { CommentRow } from "../../../../../../../../src/pub/protocol.ts";
  import { elementOf, paragraphMarks } from "../../../../comment/view.ts";
  import { boxToPercent, type Size } from "../embed.ts";
  import { quoteAt, segments } from "../../../../comment/quote.ts";
  import type { ArticleSlide } from "../load.server.ts";
  import { useApp } from "../../../../../shell/use-app.ts";
  import Icon from "../../../../../common/ui/icon.svelte";
  import SlideZoom from "./slide-zoom.svelte";

  let {
    slides,
    lang,
    script,
    comments,
    selectedId = null,
    size,
    canComment = false,
    onselect,
    onshowslide,
    oncommentslide,
    oncommentquote,
  }: {
    slides: ArticleSlide[];
    lang: string;
    script: "public" | "owner" | "hidden";
    comments: CommentRow[];
    selectedId?: string | null;
    size: Size;
    canComment?: boolean;
    onselect?: (id: string) => void;
    onshowslide?: (slug: string) => void;
    oncommentslide?: (slug: string) => void;
    oncommentquote?: (selection: QuoteSelection) => void;
  } = $props();

  const { t } = useApp();
  let zoom: SlideZoom | undefined = $state();
  let root: HTMLDivElement | undefined = $state();
  let pending: (QuoteSelection & { x: number; y: number }) | null = $state(null);
  let shortcut = $state("Ctrl+Alt+M");
  $effect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.platform)) {
      shortcut = "⌘⌥M";
    }
  });

  const marksBySlide = $derived(
    new Map(
      slides.map((slide) => [slide.slug, paragraphMarks(slide.slug, slide.paragraphs ?? [], comments)]),
    ),
  );
  const pinsBySlide = $derived.by(() => {
    const pins = new Map<string, { id: string; number: number; box: ReturnType<typeof boxToPercent> }[]>();
    for (const comment of comments) {
      const element = elementOf(comment);
      if (!element || comment.status === "resolved" || comment.status === "detached") {
        continue;
      }
      const list = pins.get(comment.slug) ?? [];
      list.push({ id: comment.id, number: comment.number, box: boxToPercent(element.box, size) });
      pins.set(comment.slug, list);
    }
    return pins;
  });

  function readSelection(): (QuoteSelection & { x: number; y: number }) | null {
    const selection = window.getSelection();
    if (!root || !selection || selection.isCollapsed || selection.rangeCount === 0) {
      return null;
    }
    const range = selection.getRangeAt(0);
    const start = range.startContainer;
    const element = start instanceof Element ? start : start.parentElement;
    const paragraph = element?.closest<HTMLElement>("p[data-p]");
    const holder = paragraph?.closest<HTMLElement>("[data-slug]");
    if (!paragraph || !holder || !root.contains(paragraph)) {
      return null;
    }
    const slug = holder.dataset.slug ?? "";
    const index = Number(paragraph.dataset.p);
    const text = slides.find((slide) => slide.slug === slug)?.paragraphs?.[index];
    if (text === undefined) {
      return null;
    }
    const from = textOffset(paragraph, range.startContainer, range.startOffset);
    const to = paragraph.contains(range.endContainer)
      ? textOffset(paragraph, range.endContainer, range.endOffset)
      : text.length;
    const quote = quoteAt(text, from, to);
    if (!quote) {
      return null;
    }
    const rects = range.getClientRects();
    const last = rects[rects.length - 1] ?? range.getBoundingClientRect();
    const box = root.getBoundingClientRect();
    return { slug, quote, x: last.right - box.left, y: last.bottom - box.top };
  }

  $effect(() => {
    if (!canComment) {
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = () => {
      clearTimeout(timer);
      timer = setTimeout(() => (pending = readSelection()), 120);
    };
    document.addEventListener("selectionchange", update);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("selectionchange", update);
    };
  });

  function commentOnPending() {
    if (!pending) {
      return;
    }
    oncommentquote?.({ slug: pending.slug, quote: pending.quote });
    pending = null;
    window.getSelection()?.removeAllRanges();
  }

  function onScriptClick(event: MouseEvent) {
    const mark = (event.target as HTMLElement).closest<HTMLElement>("mark[data-ids]");
    if (!mark || !window.getSelection()?.isCollapsed) {
      return;
    }
    const id = mark.dataset.ids?.split(" ")[0];
    if (id) {
      onselect?.(id);
    }
  }
</script>

<svelte:document
  onkeydown={(event) => {
    // ⌘⌥M / Ctrl+Alt+M comments on the selected words, as in most editors, for the keyboard.
    if (pending && event.code === "KeyM" && event.altKey && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      commentOnPending();
    }
  }}
/>

<div class="article" bind:this={root} id="dek-script">
  <h2 class="visually-hidden">{t("talk.script")}</h2>
  {#if script === "hidden"}
    <p class="notice"><Icon name="lock" size={14} />{t("talk.scriptHidden")}</p>
  {:else if script === "owner"}
    <p class="notice owner"><Icon name="lock" size={14} />{t("talk.scriptOwner")}</p>
  {/if}

  {#each slides as slide, i (slide.slug)}
    {@const marks = marksBySlide.get(slide.slug) ?? []}
    {@const pins = pinsBySlide.get(slide.slug) ?? []}
    <section class="slide" aria-labelledby={slide.slug}>
      <div class="head">
        <a class="label num" href="#{slide.slug}" aria-label={t("talk.slideLabel", { n: i + 1 })}>{String(i + 1).padStart(2, "0")}</a>
        <h3 id={slide.slug} {lang}>{slide.title}</h3>
        {#if canComment}
          <button type="button" class="slide-comment" onclick={() => oncommentslide?.(slide.slug)}>
            <Icon name="message" size={14} /><span>{t("comment.post")}</span>
          </button>
        {/if}
      </div>
      <figure class="figure">
        {#if slide.picture}
          <button type="button" class="picture" onclick={() => zoom?.show(slide, i, lang)} aria-label={t("talk.zoomSlide", { n: i + 1 })} aria-haspopup="dialog">
            <img src={slide.picture} alt={slide.title} loading={i < 2 ? "eager" : "lazy"} decoding="async" width={size.width} height={size.height} />
          </button>
        {:else}
          <button type="button" class="placeholder" onclick={() => onshowslide?.(slide.slug)} style:aspect-ratio="{size.width} / {size.height}">
            <span class="ph-title" {lang}>{slide.title}</span>
            <span class="ph-hint"><Icon name="arrow-up-right" size={14} />{t("talk.showSlide", { n: i + 1 })}</span>
          </button>
        {/if}
        {#each pins as pin (pin.id)}
          <span
            class="target"
            class:active={pin.id === selectedId}
            style:left="{pin.box.x}%"
            style:top="{pin.box.y}%"
            style:width="{pin.box.width}%"
            style:height="{pin.box.height}%"
            aria-hidden="true"
          ></span>
          <button
            type="button"
            class="pin num"
            data-id={pin.id}
            class:active={pin.id === selectedId}
            style:left="{pin.box.x + pin.box.width}%"
            style:top="{pin.box.y}%"
            aria-label={t("comment.pin", { n: pin.number })}
            onclick={() => onselect?.(pin.id)}>{pin.number}</button
          >
        {/each}
      </figure>
      {#if slide.picture}
        <p class="jump">
          <button type="button" onclick={() => onshowslide?.(slide.slug)}>
            {t("talk.jumpToSlide", { n: i + 1 })}<Icon name="arrow-up" size={13} />
          </button>
        </p>
      {/if}
      {#if slide.paragraphs && slide.paragraphs.length > 0}
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <div class="script prose" data-slug={slide.slug} {lang} onclick={onScriptClick}>
          {#each slide.paragraphs as paragraph, p (p)}
            <p data-p={p}>{#each segments(paragraph, marks[p] ?? []) as segment, s (s)}{#if segment.ids.length > 0}<mark data-ids={segment.ids.join(" ")} class:active={selectedId !== null && segment.ids.includes(selectedId)} class:stacked={segment.ids.length > 1}>{segment.text}</mark>{:else}{segment.text}{/if}{/each}</p>
          {/each}
        </div>
      {/if}
    </section>
  {/each}

  {#if pending}
    <div class="adder" style:left="{pending.x}px" style:top="{pending.y}px">
      <button
        type="button"
        aria-label={t("comment.onSelection")}
        aria-keyshortcuts="Meta+Alt+M Control+Alt+M"
        title={t("comment.selectionKeys", { keys: shortcut })}
        onpointerdown={(event) => event.preventDefault()}
        onclick={commentOnPending}
      >
        <Icon name="message" size={14} />{t("comment.post")}
      </button>
    </div>
    <p class="visually-hidden" role="status">{t("comment.selectionKeys", { keys: shortcut })}</p>
    <div class="adder-bar" role="region" aria-label={t("comment.onSelection")}>
      <button type="button" onpointerdown={(event) => event.preventDefault()} onclick={commentOnPending}>
        <Icon name="message" />{t("comment.onSelection")}
      </button>
    </div>
  {/if}
</div>

<SlideZoom bind:this={zoom} total={slides.length} />

<style>
  .article {
    position: relative;
    min-width: 0;
  }
  .notice {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    max-width: var(--measure);
    margin: 0 auto var(--space-10);
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--bg-subtle);
    color: var(--text-muted);
    font-size: var(--text-md);
  }
  .notice.owner {
    border-color: var(--accent-border);
    background: var(--accent-subtle);
    color: var(--accent);
  }
  .slide {
    margin-bottom: var(--space-16);
  }
  .head {
    display: flex;
    align-items: baseline;
    gap: var(--space-3);
    max-width: var(--measure);
    margin: 0 auto var(--space-4);
  }
  .label {
    flex-shrink: 0;
    min-width: 2ch;
    color: var(--text-faint);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    text-decoration: none;
  }
  .label:hover {
    color: var(--accent);
  }
  h3 {
    flex: 1;
    min-width: 0;
    font-size: var(--text-lg);
    scroll-margin-top: calc(var(--header-height) + var(--space-6));
  }
  @media (min-width: 768px) {
    h3 {
      font-size: var(--text-xl);
    }
  }
  .slide-comment {
    display: inline-flex;
    align-self: center;
    align-items: center;
    gap: 6px;
    height: 28px;
    padding: 0 8px;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-faint);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    cursor: pointer;
    opacity: 0;
    transition:
      opacity var(--dur-fast) var(--ease-out),
      background-color var(--dur-instant) var(--ease-out);
  }
  .slide:hover .slide-comment,
  .slide-comment:focus-visible {
    opacity: 1;
  }
  .slide-comment:hover {
    background: var(--bg-subtle);
    color: var(--text);
  }
  /* On a touch screen or a narrow one, the button shows as its icon only, always, so the heading
     beside it keeps its width. */
  @media (pointer: coarse), (max-width: 767px) {
    .slide-comment {
      opacity: 1;
      min-height: 44px;
    }
    .slide-comment span {
      display: none;
    }
  }
  /* The picture keeps to the text's measure, so heading, slide and paragraphs share both edges. */
  .figure {
    position: relative;
    max-width: var(--measure);
    margin: 0 auto var(--space-6);
  }
  .jump {
    display: flex;
    justify-content: flex-end;
    max-width: var(--measure);
    margin: calc(var(--space-6) * -1 + var(--space-2)) auto var(--space-6);
  }
  .jump button {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 4px;
    border: 0;
    border-radius: var(--radius-xs);
    background: transparent;
    color: var(--text-faint);
    font: inherit;
    font-size: var(--text-sm);
    cursor: pointer;
    opacity: 0;
    transition:
      opacity var(--dur-fast) var(--ease-out),
      color var(--dur-instant) var(--ease-out);
  }
  /* Like the Comment button by the heading: there while the slide's part is under the pointer. */
  .slide:hover .jump button,
  .jump button:focus-visible {
    opacity: 1;
  }
  @media (pointer: coarse) {
    .jump button {
      opacity: 1;
    }
  }
  .jump button:hover {
    color: var(--accent);
  }
  .picture,
  .placeholder {
    display: block;
    width: 100%;
    padding: 0;
    border: 0;
    border-radius: var(--radius-md);
    background: var(--bg-subtle);
    box-shadow: 0 0 0 1px var(--border);
    overflow: hidden;
    cursor: zoom-in;
  }
  .picture img {
    width: 100%;
    height: auto;
    transition: opacity var(--dur-base) var(--ease-out);
  }
  .picture:hover img {
    opacity: 0.94;
  }
  .placeholder {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: space-between;
    padding: clamp(16px, 4vw, 40px);
    background:
      linear-gradient(var(--bg-subtle), var(--bg-subtle)) padding-box,
      repeating-linear-gradient(-45deg, var(--border) 0 1px, transparent 1px 8px);
    color: var(--text);
    text-align: left;
  }
  .ph-title {
    font-size: clamp(var(--text-lg), 3vw, var(--text-3xl));
    font-weight: var(--weight-semibold);
    line-height: var(--leading-tight);
    letter-spacing: var(--tracking-heading-en);
    text-wrap: balance;
  }
  .ph-hint {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--text-muted);
    font-size: var(--text-sm);
  }
  .target {
    position: absolute;
    border: 2px dashed transparent;
    border-radius: 4px;
    pointer-events: none;
    transition: border-color var(--dur-fast) var(--ease-out);
  }
  .figure:hover .target,
  .target.active {
    border-color: var(--accent);
  }
  .pin {
    position: absolute;
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    padding: 0;
    border: 0;
    border-radius: var(--radius-full);
    background: var(--pin);
    color: var(--on-accent);
    box-shadow:
      0 0 0 2px var(--surface),
      var(--shadow-sm);
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
    transform: translate(-50%, -50%);
    cursor: pointer;
    transition: transform var(--dur-fast) var(--ease-out);
  }
  .pin::after {
    content: "";
    position: absolute;
    inset: -11px;
  }
  .pin:hover,
  .pin.active {
    transform: translate(-50%, -50%) scale(1.15);
  }
  .pin.active {
    box-shadow:
      0 0 0 2px var(--surface),
      0 0 0 4px var(--accent);
  }
  .script {
    margin: 0 auto;
    color: var(--text);
  }
  .script p + p {
    margin-top: 1em;
  }
  mark {
    background: var(--highlight);
    color: inherit;
    border-radius: 2px;
    box-shadow: inset 0 -2px var(--highlight-underline);
    -webkit-box-decoration-break: clone;
    box-decoration-break: clone;
    cursor: pointer;
    transition: background-color var(--dur-base) var(--ease-out);
  }
  mark.stacked,
  mark.active {
    background: var(--highlight-active);
  }
  .adder {
    position: absolute;
    z-index: var(--z-popover);
    transform: translate(-50%, 8px);
    animation: pop var(--dur-base) var(--ease-out);
  }
  .adder button,
  .adder-bar button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 32px;
    padding: 0 12px;
    border: 0;
    border-radius: var(--radius-full);
    background: var(--gray-1000);
    color: var(--bg);
    box-shadow: var(--shadow-md);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    white-space: nowrap;
    cursor: pointer;
  }
  .adder-bar {
    display: none;
  }
  @media (max-width: 767px), (pointer: coarse) {
    .adder {
      display: none;
    }
    .adder-bar {
      position: fixed;
      z-index: var(--z-drawer);
      left: 0;
      right: 0;
      bottom: 0;
      display: flex;
      justify-content: center;
      padding: var(--space-3) var(--space-4) calc(var(--space-3) + env(safe-area-inset-bottom));
      border-top: 1px solid var(--border);
      background: var(--surface-raised);
      box-shadow: var(--shadow-lg);
      animation: rise var(--dur-slow) var(--ease-out);
    }
    .adder-bar button {
      width: 100%;
      max-width: 400px;
      height: 44px;
      justify-content: center;
      border-radius: var(--radius-sm);
      background: var(--accent);
      color: var(--on-accent);
      font-size: var(--text-md);
    }
  }
  @keyframes pop {
    from {
      opacity: 0;
      transform: translate(-50%, 4px);
    }
  }
  @keyframes rise {
    from {
      transform: translateY(100%);
    }
  }
</style>
