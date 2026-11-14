<script lang="ts">
  // A profile's talks, as a gallery of covers or as a timeline by year; the page keeps which,
  // in its address. The owner sees each talk's visibility.
  import { formatDate, guessLang, slideCount } from "../../../../../common/i18n.ts";
  import Icon from "../../../../../common/ui/icon.svelte";
  import Tabs from "../../../../../common/ui/tabs.svelte";
  import { useApp } from "../../../../../shell/use-app.ts";
  import { talkPath } from "../../../../deck/deck.ts";
  import type { TalkCard } from "../../../../deck/type.ts";
  import TalkCardView from "../../../../deck/ui/talk-card.svelte";
  import VisibilityBadge from "../../../../deck/ui/visibility-badge.svelte";
  import type { ProfileView } from "../view.ts";

  let {
    talks,
    handle,
    isOwner,
    view,
    onview,
  }: {
    talks: TalkCard[];
    handle: string;
    isOwner: boolean;
    view: ProfileView;
    onview: (next: ProfileView) => void;
  } = $props();

  const { lang, t } = useApp();

  const years = $derived.by(() => {
    const groups = new Map<string, TalkCard[]>();
    for (const talk of talks) {
      const year = (talk.date ?? talk.updatedAt).slice(0, 4);
      groups.set(year, [...(groups.get(year) ?? []), talk]);
    }
    return [...groups].sort(([a], [b]) => b.localeCompare(a));
  });
</script>

<Tabs
  id="dek-talks"
  label={t("profile.view")}
  options={[
    { value: "gallery", label: t("profile.gallery"), icon: "grid" },
    { value: "timeline", label: t("profile.timeline"), icon: "timeline" },
  ]}
  value={view}
  onselect={onview}
/>
<div class="panel" role="tabpanel" id="dek-talks-{view}" aria-labelledby="dek-talks-{view}-tab">
  {#if view === "gallery"}
    <ul class="grid">
      {#each talks as talk (talk.slug)}
        <li><TalkCardView card={talk} showOwner={false} visibility={isOwner ? talk.visibility : undefined} /></li>
      {/each}
    </ul>
  {:else}
    {#each years as [year, inYear] (year)}
      <h3 class="year num">{year}</h3>
      <ul class="list">
        {#each inYear as talk (talk.slug)}
          <li>
            <a class="row" href={talkPath(handle, talk.slug)}>
              <span class="thumb">
                {#if talk.picture}
                  <img src={talk.picture} alt="" loading="lazy" decoding="async" width="1280" height="720" />
                {:else}
                  <Icon name="image" />
                {/if}
              </span>
              <span class="text">
                <span class="title" lang={guessLang([talk.title], lang) ?? undefined}>{talk.title}</span>
                <span class="meta">
                  {#if talk.event}<span>{talk.event}</span><span aria-hidden="true">·</span>{/if}
                  {#if talk.date}<time datetime={talk.date}>{formatDate(lang, talk.date)}</time><span aria-hidden="true">·</span>{/if}
                  <span class="num">{slideCount(lang, talk.slides)}</span>
                </span>
                {#if isOwner}
                  <span class="badge"><VisibilityBadge visibility={talk.visibility} /></span>
                {/if}
              </span>
            </a>
          </li>
        {/each}
      </ul>
    {/each}
  {/if}
</div>

<style>
  .panel {
    padding-top: var(--space-6);
  }
  .grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: var(--space-10) var(--space-6);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  @media (min-width: 640px) {
    .grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (min-width: 1024px) {
    .grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }
  .year {
    margin: 0 0 var(--space-2);
    padding-bottom: var(--space-2);
    border-bottom: 1px solid var(--border);
    color: var(--text-muted);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    letter-spacing: 0;
  }
  .list {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .row {
    display: flex;
    gap: var(--space-4);
    margin: 0 calc(-1 * var(--space-3));
    padding: var(--space-3);
    border-radius: var(--radius-md);
    color: var(--text);
    text-decoration: none;
    transition: background-color var(--dur-instant) var(--ease-out);
  }
  .row:hover {
    background: var(--bg-subtle);
    color: var(--text);
  }
  .thumb {
    display: grid;
    place-items: center;
    flex-shrink: 0;
    align-self: flex-start;
    width: 144px;
    aspect-ratio: 16 / 9;
    border-radius: 6px;
    background: var(--bg-active);
    box-shadow: 0 0 0 1px var(--border);
    color: var(--text-faint);
    overflow: hidden;
  }
  .thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .text {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
    padding-top: 2px;
  }
  .title {
    font-size: var(--text-lg);
    font-weight: var(--weight-semibold);
    line-height: var(--leading-snug);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
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
  .year:not(:first-child) {
    margin-top: var(--space-8);
  }
  @media (max-width: 639px) {
    .thumb {
      width: 96px;
    }
    .title {
      font-size: var(--text-base);
    }
  }
</style>
