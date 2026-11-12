<script lang="ts" module>
  import type { CommentAnchor } from "../../../../../src/pub/protocol.ts";

  /** A comment being written: what it will point at. */
  export type Draft = { anchor: CommentAnchor; slideNumber: number | null };
</script>

<script lang="ts">
  import { type Filter, matchesFilter } from "../../lib/comment-view.ts";
  import { useApp } from "../app.ts";
  import Icon from "../Icon.svelte";
  import CommentCard, { type CardComment, type ReplyInput } from "./CommentCard.svelte";
  import Composer from "./Composer.svelte";

  let {
    comments,
    slideNumbers,
    filter = $bindable("open"),
    selectedId = null,
    draft = null,
    isOwner = false,
    canComment = false,
    guest = false,
    closable = false,
    signinHref,
    onselect,
    onanchor,
    onresolve,
    onreopen,
    onreply,
    oncreate,
    oncanceldraft,
    onretry,
    oncopylink,
    onclose,
    anchorTops = null,
  }: {
    comments: CardComment[];
    slideNumbers: Map<string, number>;
    filter?: Filter;
    selectedId?: string | null;
    draft?: Draft | null;
    isOwner?: boolean;
    canComment?: boolean;
    guest?: boolean;
    closable?: boolean;
    signinHref?: string;
    onselect: (comment: CardComment) => void;
    onanchor: (comment: CardComment) => void;
    onresolve: (comment: CardComment) => Promise<void>;
    onreopen: (comment: CardComment) => Promise<void>;
    onreply: (comment: CardComment, input: ReplyInput) => Promise<boolean>;
    oncreate: (input: ReplyInput) => Promise<boolean>;
    oncanceldraft: () => void;
    onretry: (comment: CardComment) => void;
    oncopylink: (comment: CardComment) => void;
    onclose?: () => void;
    /** Where each card's anchor is, from the top of the list; given, the cards sit beside them. */
    anchorTops?: Map<string, number> | null;
  } = $props();

  const { shared, t } = useApp();
  const shown = $derived(comments.filter((comment) => comment.pending || matchesFilter(comment, filter)));
  const openCount = $derived(comments.filter((comment) => comment.status !== "resolved").length);
  const counts = $derived({
    open: openCount,
    resolved: comments.length - openCount,
    all: comments.length,
  });
  const filters: Filter[] = ["open", "resolved", "all"];
  const draftQuote = $derived(
    draft?.anchor.targets.find((target) => target.kind === "quote") as
      | { kind: "quote"; quote: string }
      | undefined,
  );
  const draftElement = $derived(
    draft?.anchor.targets.find((target) => target.kind === "element") as
      | { kind: "element"; name: string; text: string }
      | undefined,
  );

  const GAP = 8;
  let heights: Record<string, number> = $state({});

  // Each card as near its anchor as the cards above it allow; the selected one exactly beside its
  // anchor, the ones before it moved up to make room, as a margin of notes does.
  const layout = $derived.by(() => {
    if (!anchorTops) {
      return null;
    }
    const tops = anchorTops;
    const ids = [...(draft ? ["__draft"] : []), ...shown.map((comment) => comment.id)];
    const order = ids
      .map((id, index) => ({ id, want: tops.get(id), index }))
      .sort((a, b) => (a.want ?? Number.POSITIVE_INFINITY) - (b.want ?? Number.POSITIVE_INFINITY) || a.index - b.index);
    const height = (id: string) => heights[id] ?? 120;
    const placed = new Map<string, number>();
    let bottom = 0;
    for (const entry of order) {
      const y = Math.max(entry.want ?? bottom, bottom);
      placed.set(entry.id, y);
      bottom = y + height(entry.id) + GAP;
    }
    const focus = draft ? "__draft" : selectedId;
    const at = order.findIndex((entry) => entry.id === focus);
    const want = at === -1 ? undefined : order[at]?.want;
    if (at !== -1 && want !== undefined) {
      placed.set(order[at]?.id ?? "", want);
      for (let i = at - 1; i >= 0; i--) {
        const id = order[i]?.id ?? "";
        const next = placed.get(order[i + 1]?.id ?? "") ?? 0;
        placed.set(id, Math.min(placed.get(id) ?? 0, next - height(id) - GAP));
      }
      bottom = want + height(order[at]?.id ?? "") + GAP;
      for (let i = at + 1; i < order.length; i++) {
        const id = order[i]?.id ?? "";
        const y = Math.max(order[i]?.want ?? bottom, bottom);
        placed.set(id, y);
        bottom = y + height(id) + GAP;
      }
      const first = Math.min(...placed.values());
      if (first < 0) {
        for (const [id, y] of placed) {
          placed.set(id, y - first);
        }
        bottom -= first;
      }
    }
    return { tops: placed, height: bottom };
  });

  function mayResolve(comment: CardComment): boolean {
    if (!shared.viewer) {
      return false;
    }
    return isOwner || (!comment.author.guest && comment.author.handle === shared.viewer.handle);
  }
</script>

{#snippet draftCard()}
  {#if draft}
      <section class="draft" aria-label={t("comment.newOn")}>
        <p class="draft-label">{t("comment.newOn")}</p>
        {#if draftQuote}
          <p class="draft-quote">{draftQuote.quote}</p>
        {:else}
          <p class="draft-chip">
            <Icon name={draftElement ? "crosshair" : "image"} size={12} />
            {draftElement && draft.slideNumber !== null
              ? t("comment.slideChip", { n: draft.slideNumber, name: draftElement.text || draftElement.name })
              : t("talk.slideLabel", { n: draft.slideNumber ?? "?" })}
          </p>
        {/if}
        <Composer {guest} autofocus oncancel={oncanceldraft} onsubmit={oncreate} />
      </section>
  {/if}
{/snippet}

<div class="panel">
  <header class="top">
    <h2 class="title">
      {t("talk.comments")}
      <span class="count num">{counts.open}</span>
    </h2>
    {#if closable}
      <button type="button" class="close" aria-label={t("comment.close")} onclick={onclose}>
        <Icon name="x" />
      </button>
    {/if}
  </header>
  <div class="filters" role="group" aria-label={t("comment.filter")}>
    {#each filters as value (value)}
      <button
        type="button"
        aria-pressed={filter === value}
        class="filter"
        onclick={() => (filter = value)}
      >
        {t(`comment.filter.${value}`)}<span class="num">{counts[value]}</span>
      </button>
    {/each}
  </div>

  <div class="list">
    {#if draft && !anchorTops}
      {@render draftCard()}
    {/if}

    {#if shown.length === 0 && !draft}
      <div class="empty">
        {#if filter === "resolved"}
          <p>{t("comment.empty")}</p>
        {:else}
          <Icon name="message" size={20} />
          <p class="empty-title">{t("comment.empty")}</p>
          {#if canComment}<p class="empty-hint">{t("comment.emptyHint")}</p>{/if}
        {/if}
      </div>
    {:else}
      <ol class="cards" class:aligned={layout !== null} style:height={layout ? `${layout.height}px` : undefined}>
        {#if draft && anchorTops}
          <li class="placed" bind:offsetHeight={heights.__draft} style:transform="translateY({layout?.tops.get('__draft') ?? 0}px)">
            {@render draftCard()}
          </li>
        {/if}
        {#each shown as comment (comment.id)}
          <li
            class:placed={layout !== null}
            bind:offsetHeight={heights[comment.id]}
            style:transform={layout ? `translateY(${layout.tops.get(comment.id) ?? 0}px)` : undefined}
          >
            <CommentCard
              {comment}
              slideNumber={slideNumbers.get(comment.slug) ?? null}
              selected={comment.id === selectedId}
              canResolve={mayResolve(comment)}
              canReply={canComment}
              {guest}
              now={shared.now}
              onselect={() => onselect(comment)}
              onanchor={() => onanchor(comment)}
              onresolve={() => onresolve(comment)}
              onreopen={() => onreopen(comment)}
              onreply={(input) => onreply(comment, input)}
              onretry={() => onretry(comment)}
              oncopylink={() => oncopylink(comment)}
            />
          </li>
        {/each}
      </ol>
    {/if}
    {#if !canComment && !shared.viewer && signinHref}
      <p class="signin"><a href={signinHref}>{t("comment.signinToComment")}</a></p>
    {/if}
  </div>
</div>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    min-height: 0;
    height: 100%;
  }
  .top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    padding: 0 0 var(--space-3);
  }
  .title {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-md);
    font-weight: var(--weight-semibold);
    letter-spacing: 0;
  }
  .count {
    display: inline-grid;
    place-items: center;
    min-width: 20px;
    height: 20px;
    padding: 0 6px;
    border-radius: var(--radius-full);
    background: var(--bg-active);
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-weight: var(--weight-medium);
  }
  .close {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
  }
  .close:hover {
    background: var(--bg-subtle);
    color: var(--text);
  }
  .filters {
    display: flex;
    gap: 2px;
    padding-bottom: var(--space-3);
    border-bottom: 1px solid var(--border);
  }
  .filter {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 28px;
    padding: 0 10px;
    border: 0;
    border-radius: var(--radius-full);
    background: transparent;
    color: var(--text-muted);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    cursor: pointer;
  }
  .filter .num {
    color: var(--text-faint);
    font-size: var(--text-xs);
  }
  .filter:hover {
    color: var(--text);
    background: var(--bg-subtle);
  }
  .filter[aria-pressed="true"] {
    background: var(--bg-active);
    color: var(--text);
  }
  .list {
    flex: 1;
    min-height: 0;
    padding-top: var(--space-3);
  }
  .cards {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .cards.aligned {
    position: relative;
    display: block;
  }
  .cards.aligned > li {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    transition: transform var(--dur-slow) var(--ease-out);
  }
  .cards.aligned .draft {
    margin-bottom: 0;
  }
  .draft {
    margin-bottom: var(--space-3);
    padding: var(--space-3);
    border: 1px solid var(--accent-border);
    border-radius: var(--radius-md);
    background: var(--surface);
    box-shadow: var(--shadow-md);
    animation: enter var(--dur-base) var(--ease-out);
  }
  .draft-label {
    margin-bottom: var(--space-2);
    color: var(--accent);
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
  }
  .draft-quote {
    margin-bottom: var(--space-3);
    padding-left: 10px;
    border-left: 2px solid var(--highlight-underline);
    color: var(--text-muted);
    font-size: var(--text-sm);
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .draft-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-bottom: var(--space-3);
    padding: 3px 8px;
    border: 1px solid var(--border);
    border-radius: var(--radius-xs);
    background: var(--bg-subtle);
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-weight: var(--weight-medium);
  }
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-10) var(--space-4);
    color: var(--text-faint);
    text-align: center;
  }
  .empty-title {
    margin-top: var(--space-2);
    color: var(--text);
    font-weight: var(--weight-medium);
  }
  .empty-hint {
    max-width: 24em;
    color: var(--text-muted);
    font-size: var(--text-sm);
  }
  .signin {
    margin-top: var(--space-4);
    font-size: var(--text-sm);
    text-align: center;
  }
  @keyframes enter {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
  }
</style>
