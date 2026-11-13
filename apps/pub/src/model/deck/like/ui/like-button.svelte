<script lang="ts">
  // The talk's like: how many accounts like it, and for a signed-in reader a switch for their own.
  // Only a click moves it: the heart pops and bursts when the reader likes, settles when they take
  // it back, and the count rolls the way it went. A like already there on load stays still.
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

  const SPARKS = 8;
  let motion: "like" | "unlike" | null = $state(null);
  // Each like gets its own count, so a second like replays the burst from the start.
  let bursts = $state(0);

  function toggle() {
    const next = !likes.liked;
    motion = next ? "like" : "unlike";
    if (next) {
      bursts += 1;
    }
    onlike?.(next);
  }
</script>

{#if canLike}
  <button
    type="button"
    class="like"
    aria-label={t("like.label")}
    aria-pressed={likes.liked}
    data-motion={motion}
    onclick={toggle}
  >
    <span class="heart">
      {#key bursts}
        {#if motion === "like"}
          <span class="burst" aria-hidden="true">
            <span class="ring"></span>
            {#each { length: SPARKS }, i (i)}
              <span class="spark" style:--turn="{i / SPARKS}turn"></span>
            {/each}
          </span>
        {/if}
        <span class="icon"><Icon name="heart" /></span>
      {/key}
    </span>
    <span class="count num">
      {#key likes.count}<span class="digits">{likes.count}</span>{/key}
    </span>
  </button>
{:else}
  <a class="like" href={signinHref} aria-label={t("like.signin")} title={t("like.signin")}>
    <span class="heart"><span class="icon"><Icon name="heart" /></span></span>
    <span class="count num"><span class="digits">{likes.count}</span></span>
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
    transition:
      background-color var(--dur-fast) var(--ease-out),
      color var(--dur-fast) var(--ease-out);
  }
  .like:hover {
    background: var(--bg-subtle);
    color: var(--text);
  }
  .like[aria-pressed="true"] {
    color: var(--danger);
  }

  .heart {
    position: relative;
    display: inline-grid;
    place-items: center;
  }
  .icon {
    display: inline-grid;
    transition: transform var(--dur-fast) var(--ease-out);
  }
  .icon :global(path) {
    transition: fill var(--dur-fast) var(--ease-out);
  }
  .like[aria-pressed="true"] .icon :global(path) {
    fill: currentColor;
  }
  .like:hover .icon {
    transform: scale(1.1);
  }
  .like:active .icon {
    transform: scale(0.85);
  }
  [data-motion="like"] .icon {
    animation: pop 420ms var(--ease-out);
  }
  [data-motion="unlike"] .icon {
    animation: settle var(--dur-slow) var(--ease-out);
  }

  /* The burst sits behind the heart and outside the button's box; it never takes a click. */
  .burst {
    position: absolute;
    inset: 50% auto auto 50%;
    pointer-events: none;
  }
  .ring {
    position: absolute;
    width: 28px;
    height: 28px;
    margin: -14px 0 0 -14px;
    border: 2px solid var(--danger);
    border-radius: 50%;
    opacity: 0;
    animation: ring 480ms var(--ease-out);
  }
  .spark {
    position: absolute;
    width: 4px;
    height: 4px;
    margin: -2px 0 0 -2px;
    border-radius: 50%;
    background: var(--danger);
    opacity: 0;
    animation: spark 560ms var(--ease-out) 60ms;
  }
  .spark:nth-child(odd) {
    background: var(--accent);
    width: 3px;
    height: 3px;
    margin: -1.5px 0 0 -1.5px;
  }

  /* The count rolls up for a like and down for one taken back. */
  .count {
    display: inline-grid;
    overflow: hidden;
    min-width: 1ch;
  }
  .digits {
    grid-area: 1 / 1;
  }
  [data-motion="like"] .digits {
    animation: roll-up var(--dur-base) var(--ease-out);
  }
  [data-motion="unlike"] .digits {
    animation: roll-down var(--dur-base) var(--ease-out);
  }

  @keyframes pop {
    0% {
      transform: scale(0.6);
    }
    40% {
      transform: scale(1.3);
    }
    65% {
      transform: scale(0.92);
    }
    100% {
      transform: scale(1);
    }
  }
  @keyframes settle {
    0% {
      transform: scale(0.8);
    }
    100% {
      transform: scale(1);
    }
  }
  @keyframes ring {
    0% {
      opacity: 0.7;
      transform: scale(0.3);
      border-width: 6px;
    }
    100% {
      opacity: 0;
      transform: scale(1.25);
      border-width: 0;
    }
  }
  @keyframes spark {
    0% {
      opacity: 1;
      transform: rotate(var(--turn)) translateY(-6px) scale(1);
    }
    100% {
      opacity: 0;
      transform: rotate(var(--turn)) translateY(-18px) scale(0.2);
    }
  }
  @keyframes roll-up {
    0% {
      opacity: 0;
      transform: translateY(60%);
    }
    100% {
      opacity: 1;
      transform: none;
    }
  }
  @keyframes roll-down {
    0% {
      opacity: 0;
      transform: translateY(-60%);
    }
    100% {
      opacity: 1;
      transform: none;
    }
  }

  /* tokens.css cuts every animation short; the burst goes too, so nothing flashes. */
  @media (prefers-reduced-motion: reduce) {
    .burst {
      display: none;
    }
  }
</style>
