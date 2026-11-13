<script lang="ts">
  // The talk's like: how many accounts like it, and for a signed-in reader a switch for their own.
  import type { LikeState } from "../../../../../../../src/pub/protocol.ts";
  import Icon from "../../../../common/ui/icon.svelte";
  import { useApp } from "../../../../shell/use-app.ts";

  let {
    likes,
    canLike,
    signinHref,
    onlike,
  }: {
    likes: LikeState;
    canLike: boolean;
    signinHref?: string;
    onlike?: (liked: boolean) => void;
  } = $props();

  const { t } = useApp();
</script>

{#if canLike}
  <button
    type="button"
    class="like"
    aria-label={t("like.label")}
    aria-pressed={likes.liked}
    onclick={() => onlike?.(!likes.liked)}
  >
    <Icon name="heart" /><span class="num">{likes.count}</span>
  </button>
{:else}
  <a class="like" href={signinHref} aria-label={t("like.signin")} title={t("like.signin")}>
    <Icon name="heart" /><span class="num">{likes.count}</span>
  </a>
{/if}

<style>
  .like {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 36px;
    padding: 0 12px;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-muted);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    text-decoration: none;
    cursor: pointer;
  }
  .like:hover {
    background: var(--bg-subtle);
    color: var(--text);
  }
  .like[aria-pressed="true"] {
    color: var(--danger);
  }
  .like[aria-pressed="true"] :global(path) {
    fill: currentColor;
  }
</style>
