<script lang="ts">
  import { formatDate, guessLang, slideCount } from "../../src/lib/i18n.ts";
  import type { TalkCard } from "../../src/server/pages.ts";
  import { useApp } from "../../src/ui/app.ts";
  import Avatar from "../../src/ui/Avatar.svelte";
  import CopyField from "../../src/ui/CopyField.svelte";
  import Icon from "../../src/ui/Icon.svelte";
  import NotFound from "../../src/ui/NotFound.svelte";
  import VisibilityBadge from "../../src/ui/VisibilityBadge.svelte";
  import type { Props } from "./index.server";

  let { profile }: Props = $props();
  const { lang, t } = useApp();

  const years = $derived.by(() => {
    const groups = new Map<string, TalkCard[]>();
    for (const talk of profile?.talks ?? []) {
      const year = (talk.date ?? talk.updatedAt).slice(0, 4);
      groups.set(year, [...(groups.get(year) ?? []), talk]);
    }
    return [...groups].sort(([a], [b]) => b.localeCompare(a));
  });
</script>

{#if !profile}
  <NotFound />
{:else}
  <div class="page">
    <header class="who">
      <Avatar name={profile.name} image={profile.image} size={72} />
      <h1>{profile.name}</h1>
      <p class="handle">@{profile.handle}</p>
      <p class="links">
        <a href="https://github.com/{profile.handle}" rel="me noopener"><Icon name="github" size={14} />GitHub</a>
        <a href="/@{profile.handle}/rss" type="application/rss+xml"><Icon name="rss" size={14} />{t("profile.rss")}</a>
      </p>
    </header>

    <section aria-labelledby="talks-title">
      <h2 id="talks-title" class="visually-hidden">{t("profile.talks")}</h2>
      {#if profile.isOwner && profile.talks.some((talk) => talk.visibility !== "public")}
        <p class="owner-note"><Icon name="lock" size={14} />{t("profile.ownerNote")}</p>
      {/if}
      {#if profile.talks.length === 0}
        <div class="empty">
          <p>{profile.isOwner ? t("profile.emptyOwner") : t("profile.empty")}</p>
          {#if profile.isOwner}
            <CopyField value="dekc pub publish" label="dekc pub publish" kind="command" prompt />
            <a href="https://hajimism.github.io/dek/{lang === 'ja' ? 'ja/' : ''}">{t("profile.howPublishing")}</a>
          {/if}
        </div>
      {:else}
        {#each years as [year, talks] (year)}
          <h3 class="year num">{year}</h3>
          <ul class="list">
            {#each talks as talk (talk.slug)}
              <li>
                <a class="row" href="/@{profile.handle}/{talk.slug}">
                  <span class="thumb">
                    {#if talk.picture}
                      <img src={talk.picture} alt="" loading="lazy" decoding="async" width="1280" height="720" />
                    {:else}
                      <Icon name="image" />
                    {/if}
                  </span>
                  <span class="text">
                    <span class="title" lang={guessLang([talk.title]) ?? undefined}>{talk.title}</span>
                    <span class="meta">
                      {#if talk.event}<span>{talk.event}</span><span aria-hidden="true">·</span>{/if}
                      {#if talk.date}<time datetime={talk.date}>{formatDate(lang, talk.date)}</time><span aria-hidden="true">·</span>{/if}
                      <span class="num">{slideCount(lang, talk.slides)}</span>
                    </span>
                    {#if profile.isOwner}
                      <span class="badge"><VisibilityBadge visibility={talk.visibility} /></span>
                    {/if}
                  </span>
                </a>
              </li>
            {/each}
          </ul>
        {/each}
      {/if}
    </section>
  </div>
{/if}

<style>
  .page {
    max-width: calc(var(--measure) + 2 * var(--page-gutter));
    margin: 0 auto;
    padding: var(--space-16) var(--page-gutter) 0;
  }
  .who {
    margin-bottom: var(--space-12);
  }
  h1 {
    margin-top: var(--space-5);
    font-size: var(--text-2xl);
  }
  .handle {
    margin-top: 2px;
    color: var(--text-muted);
    font-size: var(--text-base);
  }
  .links {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-5);
    margin-top: var(--space-4);
  }
  .links a {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--text-muted);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    text-decoration: none;
  }
  .links a:hover {
    color: var(--text);
  }
  .owner-note {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-6);
    color: var(--text-muted);
    font-size: var(--text-sm);
  }
  .year {
    margin: var(--space-8) 0 var(--space-2);
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
  .empty {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-4);
    padding: var(--space-8) 0;
    color: var(--text-muted);
    font-size: var(--text-base);
  }
  .empty :global(.field) {
    width: 100%;
    max-width: 360px;
  }
  @media (max-width: 639px) {
    .page {
      padding-top: var(--space-10);
    }
    .thumb {
      width: 96px;
    }
    .title {
      font-size: var(--text-base);
    }
  }
</style>
