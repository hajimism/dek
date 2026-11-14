<script lang="ts">
  
  import type { Visibility } from "../../../../../../src/pub/protocol.ts";
import { formatDate, guessLang, slideCount } from "../../../common/i18n.ts";
  import Icon from "../../../common/ui/icon.svelte";
  import { useApp } from "../../../shell/use-app.ts";
  import Avatar from "../../person/ui/avatar.svelte";
  import { talkPath } from "../deck.ts";
  import type { TalkCard } from "../type.ts";
  import VisibilityBadge from "./visibility-badge.svelte";

  let {
    card,
    showOwner = true,
    visibility,
  }: {
    card: TalkCard;
    showOwner?: boolean;
    /** The talk's visibility, shown to its owner; nobody else is given it. */
    visibility?: Visibility;
  } = $props();
  const { lang } = useApp();
</script>

<a class="card" href={talkPath(card.owner.handle, card.slug)}>
  <span class="thumb">
    {#if card.picture}
      <img src={card.picture} alt="" loading="lazy" decoding="async" width="1280" height="720" />
    {:else}
      <span class="ph"><Icon name="image" size={20} /></span>
    {/if}
  </span>
  <span class="text">
    <span class="title" lang={guessLang([card.title], lang) ?? undefined}>{card.title}</span>
    <span class="meta">
      {#if card.event}<span>{card.event}</span><span aria-hidden="true">·</span>{/if}
      {#if card.date}<time datetime={card.date}>{formatDate(lang, card.date)}</time><span aria-hidden="true">·</span>{/if}
      <span class="num">{slideCount(lang, card.slides)}</span>
    </span>
    {#if showOwner}
      <span class="owner">
        <Avatar name={card.owner.name} image={card.owner.image} size={20} />
        {card.owner.name}
      </span>
    {/if}
    {#if visibility}
      <span class="badge"><VisibilityBadge {visibility} /></span>
    {/if}
  </span>
</a>

<style>
  .card {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    color: var(--text);
    text-decoration: none;
    border-radius: var(--radius-md);
  }
  .card:hover {
    color: var(--text);
  }
  .thumb {
    display: block;
    aspect-ratio: 16 / 9;
    border-radius: var(--radius-md);
    background: var(--bg-subtle);
    box-shadow: 0 0 0 1px var(--border);
    overflow: hidden;
  }
  .thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform var(--dur-slow) var(--ease-out);
  }
  .card:hover .thumb img {
    transform: scale(1.02);
  }
  .ph {
    display: grid;
    place-items: center;
    height: 100%;
    color: var(--text-faint);
  }
  .text {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .title {
    font-size: var(--text-base);
    font-weight: var(--weight-semibold);
    line-height: var(--leading-snug);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .card:hover .title {
    text-decoration: underline;
    text-decoration-thickness: 1px;
    text-underline-offset: 0.2em;
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    color: var(--text-muted);
    font-size: var(--text-sm);
  }
  .badge {
    margin-top: 2px;
  }
  .owner {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-top: 2px;
    color: var(--text-muted);
    font-size: var(--text-sm);
  }
</style>
