<script lang="ts" module>
  import type { CommentRow } from "../../../../../src/pub/protocol.ts";

  /** A row from the API, or one being sent: shown at once, faded until the server has it. */
  export type CardComment = CommentRow & { pending?: boolean; failed?: boolean };

  export type ReplyInput = { text: string; guestName?: string; turnstile?: string };
</script>

<script lang="ts">
  import { absoluteTime, relativeTime } from "../../lib/i18n.ts";
  import { elementOf, quoteOf } from "../../lib/comment-view.ts";
  import { useApp } from "../app.ts";
  import Avatar from "../Avatar.svelte";
  import Badge from "../Badge.svelte";
  import Icon from "../Icon.svelte";
  import Composer from "./Composer.svelte";

  let {
    comment,
    slideNumber,
    selected = false,
    canResolve = false,
    canReply = false,
    guest = false,
    now,
    onselect,
    onanchor,
    onresolve,
    onreopen,
    onreply,
    onretry,
    oncopylink,
  }: {
    comment: CardComment;
    /** The slide's place in the deck, for the anchor chip. */
    slideNumber: number | null;
    selected?: boolean;
    canResolve?: boolean;
    canReply?: boolean;
    guest?: boolean;
    now: number;
    onselect?: () => void;
    onanchor?: () => void;
    onresolve?: () => Promise<void> | void;
    onreopen?: () => Promise<void> | void;
    onreply?: (input: ReplyInput) => Promise<boolean>;
    onretry?: () => void;
    oncopylink?: () => void;
  } = $props();

  const { lang, t } = useApp();
  const quote = $derived(quoteOf(comment));
  const element = $derived(elementOf(comment));
  const resolved = $derived(comment.status === "resolved");
  let expanded = $state(false);
  let showAllReplies = $state(false);
  let replying = $state(false);
  let busy = $state(false);

  const collapsedReplies = $derived(
    comment.thread.length > 3 && !showAllReplies ? comment.thread.length - 1 : 0,
  );
  const shownReplies = $derived(
    collapsedReplies > 0 ? comment.thread.slice(-1) : comment.thread,
  );

  async function run(action?: () => Promise<void> | void) {
    if (!action || busy) {
      return;
    }
    busy = true;
    try {
      await action();
    } finally {
      busy = false;
    }
  }
</script>

{#snippet when(iso: string)}
  <time datetime={iso} title={absoluteTime(lang, iso)}>{relativeTime(lang, iso, now)}</time>
{/snippet}

{#snippet anchor()}
  {#if quote}
    <button type="button" class="quote" class:gone={comment.status === "detached"} onclick={onanchor}>
      <span class="quote-text">{quote.quote}</span>
    </button>
  {:else}
    <button type="button" class="chip" onclick={onanchor}>
      <Icon name={element ? "crosshair" : "image"} size={12} />
      {#if slideNumber !== null}
        {element
          ? t("comment.slideChip", { n: slideNumber, name: element.text || element.name })
          : t("talk.slideLabel", { n: slideNumber })}
      {:else}
        {comment.slug}
      {/if}
    </button>
  {/if}
{/snippet}

<article
  id={comment.id}
  class="card"
  class:selected
  class:pending={comment.pending}
  class:resolved={resolved && !expanded}
  aria-label="#{comment.number} {comment.author.name}"
>
  {#if resolved && !expanded}
    <div class="collapsed">
      <Icon name="check" size={14} />
      <button type="button" class="collapsed-text" onclick={() => (expanded = true)} aria-expanded="false">
        <span class="who">{comment.author.name}</span>
        <span class="snippet">{comment.text}</span>
      </button>
      {#if canResolve}
        <button type="button" class="link-btn" disabled={busy} onclick={() => run(onreopen)}>{t("comment.reopen")}</button>
      {/if}
    </div>
  {:else}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="main" onclick={(event) => {
      if (!(event.target as HTMLElement).closest("button, a, textarea, input")) {
        onselect?.();
      }
    }}>
      {#if comment.status === "moved" || comment.status === "detached" || resolved}
        <div class="badges">
          {#if comment.status === "moved"}
            <Badge tone="accent"><Icon name="arrow-up-right" size={12} />{t("comment.moved")}</Badge>
          {:else if comment.status === "detached"}
            <Badge tone="warning"><Icon name="alert" size={12} />{t("comment.detachedBadge")}</Badge>
          {:else}
            <Badge tone="neutral"><Icon name="check" size={12} />{t("comment.resolvedBy")}</Badge>
          {/if}
          <span class="version">{t("comment.version", { n: comment.version })}</span>
        </div>
      {/if}
      {@render anchor()}
      {#if comment.status === "detached"}
        <p class="note">{t("comment.detached", { n: comment.version })}</p>
      {:else if comment.status === "moved"}
        <p class="note">{t("comment.movedHint")}</p>
      {/if}

      <header class="head">
        <Avatar name={comment.author.name} size={20} guest={comment.author.guest} />
        <span class="name">{comment.author.name}</span>
        {#if comment.author.guest}<Badge tone="outline">{t("comment.guestBadge")}</Badge>{/if}
        <span class="meta"><span class="number">#{comment.number}</span> · {@render when(comment.createdAt)}</span>
      </header>
      <p class="body">{comment.text}</p>

      {#if comment.failed}
        <p class="failed" role="alert">
          <Icon name="alert" size={14} />{t("comment.notSent")}
          <button type="button" class="link-btn" onclick={onretry}>{t("common.retry")}</button>
        </p>
      {/if}

      {#if comment.thread.length > 0}
        <ol class="replies">
          {#if collapsedReplies > 0}
            <li>
              <button type="button" class="link-btn more" onclick={() => (showAllReplies = true)}>
                {t("comment.moreReplies", { n: collapsedReplies })}
              </button>
            </li>
          {/if}
          {#each shownReplies as reply (reply.id)}
            <li class="reply">
              <header class="head">
                <Avatar name={reply.author.name} size={20} guest={reply.author.guest} />
                <span class="name">{reply.author.name}</span>
                {#if reply.author.guest}<Badge tone="outline">{t("comment.guestBadge")}</Badge>{/if}
                <span class="meta">{@render when(reply.createdAt)}</span>
              </header>
              <p class="body">{reply.text}</p>
            </li>
          {/each}
        </ol>
      {/if}

      {#if !comment.pending && !comment.failed}
        {#if replying && onreply}
          <div class="reply-box">
            <Composer
              compact
              {guest}
              placeholder={t("comment.replyPlaceholder")}
              submitLabel={t("comment.reply")}
              autofocus
              oncancel={() => (replying = false)}
              onsubmit={async (input) => {
                const ok = await onreply(input);
                if (ok) {
                  replying = false;
                }
                return ok;
              }}
            />
          </div>
        {:else}
          <footer class="actions">
            {#if canReply}
              <button type="button" class="action" onclick={() => (replying = true)}>
                <Icon name="reply" size={14} />{t("comment.reply")}
              </button>
            {/if}
            {#if canResolve}
              {#if resolved}
                <button type="button" class="action" disabled={busy} onclick={() => run(onreopen)}>
                  {t("comment.reopen")}
                </button>
              {:else}
                <button type="button" class="action" disabled={busy} onclick={() => run(onresolve)}>
                  <Icon name="check" size={14} />{t("comment.resolve")}
                </button>
              {/if}
            {/if}
            <button type="button" class="action icon" aria-label={t("comment.copyLink")} title={t("comment.copyLink")} onclick={oncopylink}>
              <Icon name="link" size={14} />
            </button>
          </footer>
        {/if}
      {/if}
    </div>
  {/if}
</article>

<style>
  .card {
    position: relative;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface);
    font-size: var(--text-md);
    transition:
      border-color var(--dur-instant) var(--ease-out),
      box-shadow var(--dur-base) var(--ease-out),
      transform var(--dur-base) var(--ease-out),
      opacity var(--dur-base) var(--ease-out);
  }
  .card:hover {
    border-color: var(--border-hover);
  }
  .card.selected {
    border-color: var(--accent-border);
    box-shadow: var(--shadow-md);
  }
  @media (min-width: 1280px) {
    .card.selected {
      transform: translateX(-8px);
    }
  }
  .card.pending {
    opacity: 0.6;
  }
  .main {
    padding: var(--space-3);
  }
  .badges {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-2);
  }
  .version {
    color: var(--text-faint);
    font-size: var(--text-xs);
    font-variant-numeric: tabular-nums;
  }
  .quote {
    display: block;
    width: 100%;
    margin: 0 0 var(--space-2);
    padding: 0 0 0 10px;
    border: 0;
    border-left: 2px solid var(--highlight-underline);
    background: transparent;
    color: var(--text-muted);
    font-size: var(--text-sm);
    text-align: left;
    cursor: pointer;
  }
  .quote:hover {
    color: var(--text);
  }
  .quote.gone {
    border-left-style: dashed;
    border-left-color: var(--border-strong);
  }
  .quote-text {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    max-width: 100%;
    height: 24px;
    margin: 0 0 var(--space-2);
    padding: 0 8px;
    border: 1px solid var(--border);
    border-radius: var(--radius-xs);
    background: var(--bg-subtle);
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-weight: var(--weight-medium);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: pointer;
  }
  .chip:hover {
    color: var(--text);
    border-color: var(--border-hover);
  }
  .note {
    margin: -2px 0 var(--space-2);
    color: var(--warning);
    font-size: var(--text-xs);
  }
  .head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
  }
  .name {
    font-weight: var(--weight-medium);
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .meta {
    margin-left: auto;
    color: var(--text-faint);
    font-size: var(--text-xs);
    white-space: nowrap;
  }
  .number {
    font-variant-numeric: tabular-nums;
  }
  .body {
    margin-top: 6px;
    color: var(--text);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  :global(:lang(ja)) .body {
    line-height: 1.7;
  }
  .replies {
    margin: var(--space-3) 0 0;
    padding: 0;
    list-style: none;
  }
  .replies > li {
    padding-top: var(--space-3);
    margin-top: var(--space-3);
    border-top: 1px solid var(--border);
  }
  .replies > li:first-child {
    margin-top: 0;
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 2px;
    margin: var(--space-2) calc(-1 * var(--space-2)) calc(-1 * var(--space-1));
  }
  .action {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 28px;
    padding: 0 8px;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-muted);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    cursor: pointer;
  }
  .action.icon {
    margin-left: auto;
    width: 28px;
    padding: 0;
    justify-content: center;
  }
  .action:hover:not(:disabled) {
    background: var(--bg-subtle);
    color: var(--text);
  }
  .action:disabled {
    opacity: 0.5;
    cursor: progress;
  }
  .reply-box {
    margin-top: var(--space-3);
  }
  .failed {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: var(--space-2);
    color: var(--danger);
    font-size: var(--text-sm);
  }
  .link-btn {
    padding: 0;
    border: 0;
    background: none;
    color: var(--accent);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    cursor: pointer;
  }
  .link-btn:hover {
    text-decoration: underline;
  }
  .more {
    font-size: var(--text-xs);
  }
  .collapsed {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-height: 40px;
    padding: 0 var(--space-3);
    color: var(--text-muted);
    font-size: var(--text-sm);
  }
  .collapsed > :global(svg) {
    color: var(--success);
  }
  .collapsed-text {
    display: flex;
    gap: 6px;
    flex: 1;
    min-width: 0;
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    text-align: left;
    cursor: pointer;
  }
  .collapsed-text .who {
    flex-shrink: 0;
    font-weight: var(--weight-medium);
  }
  .snippet {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .card.resolved {
    background: var(--bg-subtle);
  }
</style>
