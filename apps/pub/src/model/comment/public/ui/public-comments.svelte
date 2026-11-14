<script lang="ts">
  // The comments at the bottom of a talk anyone may open: on the talk as a whole, oldest first,
  // each with one level of replies. Their author changes them; the author or the owner removes them.
  import type { PublicComment, PublicReply } from "../../../../../../../src/pub/protocol.ts";
  import { absoluteTime, relativeTime } from "../../../../common/i18n.ts";
  import Button from "../../../../common/ui/button.svelte";
  import { now as currentTime } from "../../../../common/ui/clock.svelte.ts";
  import { useApp } from "../../../../shell/use-app.ts";
  import Avatar from "../../../person/ui/avatar.svelte";
  import type { ReplyInput } from "../../type.ts";
  import Composer from "../../ui/composer.svelte";

  let {
    comments,
    canPost,
    off = false,
    isOwner = false,
    signinHref,
    onpost,
    onedit,
    ondelete,
  }: {
    comments: PublicComment[];
    canPost: boolean;
    /** The deck's policy lets no one post. */
    off?: boolean;
    isOwner?: boolean;
    signinHref: string;
    onpost: (input: ReplyInput, parentId: string | null) => Promise<boolean>;
    onedit: (id: string, text: string) => Promise<boolean>;
    ondelete: (id: string) => Promise<void>;
  } = $props();

  const { shared, lang, t } = useApp();
  const count = $derived(comments.reduce((n, top) => n + 1 + top.replies.length, 0));
  let replying: string | null = $state(null);
  let editing: string | null = $state(null);
  let draft = $state("");
  let confirming: string | null = $state(null);

  const mine = (comment: PublicReply) =>
    shared.viewer !== null && comment.author.handle === shared.viewer.handle;

  async function save(id: string) {
    if (draft.trim() && (await onedit(id, draft.trim()))) {
      editing = null;
    }
  }
</script>

{#snippet item(comment: PublicReply, top: boolean)}
  <article class="item" class:reply={!top}>
    <header class="byline">
      <Avatar name={comment.author.name} size={28} />
      <span class="name">{comment.author.name}</span>
      <time datetime={comment.createdAt} title={absoluteTime(lang, comment.createdAt)}>
        {relativeTime(lang, comment.createdAt, currentTime(shared.now))}
      </time>
      {#if comment.editedAt}<span class="edited">· {t("public.edited")}</span>{/if}
    </header>
    {#if editing === comment.id}
      <form
        class="edit"
        onsubmit={(event) => {
          event.preventDefault();
          save(comment.id);
        }}
      >
        <label class="visually-hidden" for="edit-{comment.id}">{t("public.edit")}</label>
        <textarea id="edit-{comment.id}" bind:value={draft} rows="2" maxlength="4000"></textarea>
        <div class="row">
          <Button variant="ghost" size="sm" onclick={() => (editing = null)}>{t("common.cancel")}</Button>
          <Button variant="primary" size="sm" type="submit">{t("public.save")}</Button>
        </div>
      </form>
    {:else}
      <p class="text">{comment.text}</p>
    {/if}
    <div class="tools">
      {#if top && canPost}
        <button type="button" class="link-btn" onclick={() => (replying = replying === comment.id ? null : comment.id)}>
          {t("public.reply")}
        </button>
      {/if}
      {#if mine(comment) && editing !== comment.id}
        <button
          type="button"
          class="link-btn"
          onclick={() => {
            editing = comment.id;
            draft = comment.text;
          }}>{t("public.edit")}</button
        >
      {/if}
      {#if mine(comment) || isOwner}
        {#if confirming === comment.id}
          <button type="button" class="link-btn danger" onclick={() => ondelete(comment.id)}>{t("public.deleteSure")}</button>
          <button type="button" class="link-btn" onclick={() => (confirming = null)}>{t("common.cancel")}</button>
        {:else}
          <button type="button" class="link-btn" onclick={() => (confirming = comment.id)}>{t("public.delete")}</button>
        {/if}
      {/if}
    </div>
  </article>
{/snippet}

<section class="public" aria-labelledby="dek-public-title">
  <h2 id="dek-public-title">{t("public.title")} <span class="num count">{count}</span></h2>
  {#if comments.length === 0}
    <p class="empty">{t("public.empty")}</p>
  {:else}
    <ol class="list">
      {#each comments as top (top.id)}
        <li>
          {@render item(top, true)}
          {#if top.replies.length > 0 || replying === top.id}
            <ol class="replies">
              {#each top.replies as reply (reply.id)}
                <li>{@render item(reply, false)}</li>
              {/each}
              {#if replying === top.id}
                <li class="reply-box">
                  <Composer
                    compact
                    autofocus
                    placeholder={t("public.replyPlaceholder")}
                    submitLabel={t("public.reply")}
                    oncancel={() => (replying = null)}
                    onsubmit={async (input) => {
                      const ok = await onpost(input, top.id);
                      if (ok) {
                        replying = null;
                      }
                      return ok;
                    }}
                  />
                </li>
              {/if}
            </ol>
          {/if}
        </li>
      {/each}
    </ol>
  {/if}
  {#if canPost}
    <div class="new">
      <Composer placeholder={t("public.placeholder")} onsubmit={(input) => onpost(input, null)} />
    </div>
  {:else if off}
    <p class="empty">{t("public.off")}</p>
  {:else if !shared.viewer}
    <Button variant="secondary" href={signinHref}>{t("public.signin")}</Button>
  {/if}
</section>

<style>
  .public {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding-top: var(--space-10);
    border-top: 1px solid var(--border);
  }
  h2 {
    font-size: var(--text-xl);
  }
  .count {
    color: var(--text-muted);
    font-size: var(--text-md);
    font-weight: var(--weight-medium);
  }
  .list,
  .replies {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: 0;
    list-style: none;
  }
  .replies {
    margin: var(--space-3) 0 0 var(--space-8);
    padding-left: var(--space-4);
    border-left: 2px solid var(--border);
  }
  .item {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .byline {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    color: var(--text-muted);
    font-size: var(--text-sm);
  }
  .name {
    color: var(--text);
    font-weight: var(--weight-semibold);
  }
  .text {
    margin-left: calc(28px + var(--space-2));
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    line-height: var(--leading-body, 1.7);
  }
  .tools {
    display: flex;
    gap: var(--space-3);
    margin-left: calc(28px + var(--space-2));
  }
  .link-btn {
    padding: 0;
    border: 0;
    background: none;
    color: var(--text-muted);
    font-size: var(--text-sm);
    cursor: pointer;
  }
  .link-btn:hover {
    color: var(--text);
    text-decoration: underline;
  }
  .link-btn.danger {
    color: var(--danger);
  }
  .edit {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin-left: calc(28px + var(--space-2));
  }
  .edit textarea {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    background: var(--surface);
    font-size: var(--text-base);
  }
  .row {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
  }
  .empty {
    color: var(--text-muted);
    font-size: var(--text-sm);
  }
  @media (max-width: 639px) {
    .replies {
      margin-left: var(--space-3);
    }
  }
</style>
