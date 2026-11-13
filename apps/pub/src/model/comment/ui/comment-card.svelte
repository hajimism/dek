
<script lang="ts">
  import { threadLabel } from "../../../../../../src/pub/thread.ts";
  import { absoluteTime, relativeTime } from "../../../common/i18n.ts";
  import Badge from "../../../common/ui/badge.svelte";
  import { now as currentTime } from "../../../common/ui/clock.svelte.ts";
  import Icon from "../../../common/ui/icon.svelte";
  import { useApp } from "../../../shell/use-app.ts";
  import Avatar from "../../person/ui/avatar.svelte";
  import type { CardComment, ReplyInput } from "../type.ts";
  import { elementOf, quoteOf } from "../view.ts";
  import Composer from "./composer.svelte";

  let {
    comment,
    slideNumber,
    selected = false,
    canResolve = false,
    canReply = false,
    canWiden = false,
    guest = false,
    now,
    onselect,
    onanchor,
    onresolve,
    onreopen,
    onwiden,
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
    /** Offer to share a team thread with the client. */
    canWiden?: boolean;
    guest?: boolean;
    now: number;
    onselect?: () => void;
    onanchor?: () => void;
    onresolve?: () => Promise<void> | void;
    onreopen?: () => Promise<void> | void;
    onwiden?: () => Promise<void> | void;
    onreply?: (input: ReplyInput) => Promise<boolean>;
    onretry?: () => void;
    oncopylink?: () => void;
  } = $props();

  const { lang, t } = useApp();
  const quote = $derived(quoteOf(comment));
  const element = $derived(elementOf(comment));
  const resolved = $derived(comment.status === "resolved");
  const label = $derived(threadLabel(comment));
  const teamOnly = $derived(comment.scope === "team");
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
  <time datetime={iso} title={absoluteTime(lang, iso)}>{relativeTime(lang, iso, currentTime(now))}</time>
{/snippet}

{#snippet anchor()}
  {#if quote && !quote.quote}
    <button type="button" class="context" onclick={onanchor}>
      <Icon name="message" size={12} />
      <span class="context-text">
        {slideNumber !== null ? `${t("talk.slideLabel", { n: slideNumber })} · ` : ""}{t("comment.quotedScript")}
      </span>
    </button>
  {:else if quote}
    <button type="button" class="quote" class:gone={comment.status === "detached"} onclick={onanchor}>
      <span class="quote-text">{quote.quote}</span>
    </button>
  {:else}
    <button type="button" class="context" onclick={onanchor}>
      <Icon name={element ? "crosshair" : "image"} size={12} />
      <span class="context-text">
        {#if slideNumber !== null}
          {element
            ? t("comment.slideChip", { n: slideNumber, name: element.text || element.name })
            : t("talk.slideLabel", { n: slideNumber })}
        {:else}
          {comment.slug}
        {/if}
      </span>
    </button>
  {/if}
{/snippet}

{#snippet byline(author: { name: string; guest: boolean }, iso: string)}
  <Avatar name={author.name} size={20} guest={author.guest} />
  <span class="name">{author.name}</span>
  {#if author.guest}<Badge tone="outline">{t("comment.guestBadge")}</Badge>{/if}
  <span class="time">{@render when(iso)}</span>
{/snippet}

<article
  id={comment.id}
  class="card"
  class:selected
  class:pending={comment.pending}
  class:resolved={resolved && !expanded}
  aria-label="#{label} {comment.author.name}"
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
      {#if comment.status === "moved" || comment.status === "detached" || resolved || teamOnly}
        <div class="badges">
          {#if teamOnly}
            <Badge tone="outline"><Icon name="lock" size={12} />{t("comment.teamOnly")}</Badge>
          {/if}
          {#if comment.status === "moved"}
            <Badge tone="accent"><Icon name="arrow-up-right" size={12} />{t("comment.moved")}</Badge>
          {:else if comment.status === "detached"}
            <Badge tone="warning"><Icon name="alert" size={12} />{t("comment.detachedBadge")}</Badge>
          {:else if resolved}
            <Badge tone="neutral"><Icon name="check" size={12} />{t("comment.resolvedBy")}</Badge>
          {/if}
          <span class="version">{t("comment.version", { n: comment.version })}</span>
        </div>
      {/if}
      <div class="anchor">
        {@render anchor()}
        <span class="number num">#{label}</span>
      </div>
      {#if comment.status === "detached"}
        <p class="note">{t("comment.detached", { n: comment.version })}</p>
      {:else if comment.status === "moved"}
        <p class="note">{t("comment.movedHint")}</p>
      {/if}

      <header class="head">
        {@render byline(comment.author, comment.createdAt)}
        {#if !comment.pending && !comment.failed}
          <span class="tools">
            {#if canWiden && teamOnly}
              <button type="button" class="link-btn" disabled={busy} onclick={() => run(onwiden)}>
                {t("comment.widen")}
              </button>
            {/if}
            {#if canResolve}
              {#if resolved}
                <button type="button" class="link-btn" disabled={busy} onclick={() => run(onreopen)}>
                  {t("comment.reopen")}
                </button>
              {:else}
                <button
                  type="button"
                  class="tool"
                  aria-label={t("comment.resolve")}
                  title={t("comment.resolve")}
                  disabled={busy}
                  onclick={() => run(onresolve)}
                >
                  <Icon name="check" size={14} />
                </button>
              {/if}
            {/if}
            <button type="button" class="tool" aria-label={t("comment.copyLink")} title={t("comment.copyLink")} onclick={oncopylink}>
              <Icon name="link" size={14} />
            </button>
          </span>
        {/if}
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
            <li class="more">
              <button type="button" class="link-btn" onclick={() => (showAllReplies = true)}>
                {t("comment.moreReplies", { n: collapsedReplies })}
              </button>
            </li>
          {/if}
          {#each shownReplies as reply (reply.id)}
            <li class="reply">
              <header class="head">{@render byline(reply.author, reply.createdAt)}</header>
              <p class="body">{reply.text}</p>
            </li>
          {/each}
        </ol>
      {/if}
    </div>

    {#if !comment.pending && !comment.failed && canReply}
      <footer class="reply-row">
        {#if replying && onreply}
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
        {:else}
          <button type="button" class="reply-open" aria-label={t("comment.reply")} onclick={() => (replying = true)}>
            {t("comment.replyPlaceholder")}
          </button>
        {/if}
      </footer>
    {/if}
  {/if}
</article>

<style>
  /* After Linear's threads: one quiet surface, the context above it, each message indented under
     its author, the actions out of sight until the card is in hand, and the reply as a field. */
  .card {
    --pad: 14px;
    --indent: 28px;
    position: relative;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface);
    box-shadow: var(--shadow-sm);
    font-size: var(--text-md);
    overflow: clip;
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
    padding: 12px var(--pad) var(--pad);
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

  .anchor {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
    margin-bottom: 10px;
  }
  .number {
    flex-shrink: 0;
    margin-left: auto;
    color: var(--text-faint);
    font-size: var(--text-xs);
    line-height: 18px;
  }
  .context {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    height: 18px;
    padding: 0;
    border: 0;
    background: none;
    color: var(--text-faint);
    font-size: var(--text-xs);
    font-weight: var(--weight-medium);
    cursor: pointer;
  }
  .context-text {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .context:hover {
    color: var(--text);
  }
  .quote {
    display: block;
    flex: 1;
    min-width: 0;
    padding: 0 0 0 10px;
    border: 0;
    border-left: 2px solid var(--highlight-underline);
    background: transparent;
    color: var(--text-muted);
    font-size: var(--text-sm);
    line-height: var(--leading-snug);
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
  .note {
    margin: -4px 0 10px;
    color: var(--warning);
    font-size: var(--text-xs);
  }

  .head {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
    min-height: 24px;
  }
  .name {
    min-width: 0;
    color: var(--text);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .time {
    flex-shrink: 0;
    color: var(--text-faint);
    font-size: var(--text-xs);
    white-space: nowrap;
  }
  /* With a pointer, the actions float over the end of the row while the card is in hand, so a
     long name keeps its room; on touch they stay in the row. */
  .tools {
    display: flex;
    align-items: center;
    gap: 2px;
    margin: 0 -6px 0 auto;
  }
  @media (pointer: fine) {
    .tools {
      position: absolute;
      top: 50%;
      right: 0;
      padding-left: var(--space-2);
      background: linear-gradient(to right, transparent, var(--surface) var(--space-2));
      opacity: 0;
      transform: translateY(-50%);
      transition: opacity var(--dur-fast) var(--ease-out);
    }
    .card:hover .tools,
    .card:focus-within .tools,
    .card.selected .tools {
      opacity: 1;
    }
  }
  .tool {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: 0;
    border-radius: var(--radius-xs);
    background: transparent;
    color: var(--text-faint);
    cursor: pointer;
  }
  .tool:hover:not(:disabled) {
    background: var(--bg-subtle);
    color: var(--text);
  }
  .tool:disabled {
    opacity: 0.5;
    cursor: progress;
  }
  .body {
    margin: 2px 0 0 var(--indent);
    color: var(--text);
    line-height: var(--leading-ui);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  :global(:lang(ja)) .body {
    line-height: 1.7;
  }

  .replies {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    margin: var(--space-4) 0 0;
    padding: 0;
    list-style: none;
  }
  .more {
    padding-left: var(--indent);
    font-size: var(--text-xs);
  }
  .more .link-btn {
    font-size: inherit;
  }

  .failed {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: var(--space-2) 0 0 var(--indent);
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
  .head .link-btn {
    margin-right: 6px;
    font-size: var(--text-xs);
  }

  .reply-row {
    border-top: 1px solid var(--border);
  }
  .reply-row:has(.reply-open) {
    padding: 0;
  }
  .reply-row:not(:has(.reply-open)) {
    padding: var(--space-3) var(--pad) var(--pad);
  }
  .reply-open {
    display: block;
    width: 100%;
    padding: 10px var(--pad);
    border: 0;
    background: transparent;
    color: var(--text-faint);
    font-size: var(--text-sm);
    text-align: left;
    cursor: text;
    transition: background-color var(--dur-instant) var(--ease-out);
  }
  .reply-open:hover {
    background: var(--bg-subtle);
    color: var(--text-muted);
  }
  .reply-open:focus-visible {
    outline-offset: calc(-1 * var(--focus-width));
  }

  .collapsed {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-height: 40px;
    padding: 0 var(--pad);
    color: var(--text-muted);
    font-size: var(--text-sm);
  }
  .collapsed > :global(svg) {
    flex-shrink: 0;
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
    box-shadow: none;
  }
</style>
