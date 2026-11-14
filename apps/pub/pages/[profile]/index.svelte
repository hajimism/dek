<script lang="ts">
  import { tick, untrack } from "svelte";
  import type { TalkPage } from "../../../../src/pub/protocol.ts";
  import { docsUrl } from "../../src/common/docs.ts";
  import { api } from "../../src/common/ui/api.ts";
  import CopyField from "../../src/common/ui/copy-field.svelte";
  import Icon from "../../src/common/ui/icon.svelte";
  import { toast } from "../../src/common/ui/toast.svelte.ts";
  import { profileHref, TALKS_PER_PAGE } from "../../src/model/person/feature/profile/paging.ts";
  import ProfileMore from "../../src/model/person/feature/profile/ui/profile-more.svelte";
  import ProfileTalks from "../../src/model/person/feature/profile/ui/profile-talks.svelte";
  import type { ProfileView } from "../../src/model/person/feature/profile/view.ts";
  import { profilePath } from "../../src/model/person/profile-path.ts";
  import Avatar from "../../src/model/person/ui/avatar.svelte";
  import NotFound from "../../src/shell/ui/not-found.svelte";
  import { useApp } from "../../src/shell/use-app.ts";
  import type { Props } from "./index.server";

  let { profile, view: asked }: Props = $props();
  const { lang, t } = useApp();

  // The view is kept in the address, so a reload or a shared link opens the same one; switching
  // it replaces the entry rather than adding one.
  let view: ProfileView = $state(untrack(() => asked));

  function choose(next: ProfileView) {
    view = next;
    const url = new URL(location.href);
    if (next === "gallery") {
      url.searchParams.delete("view");
    } else {
      url.searchParams.set("view", next);
    }
    history.replaceState(history.state, "", url);
  }

  // "Show more" adds the next page below the talks there are, and moves focus to the first of
  // them. The address stays the page the reader came to, so a shared link opens where it did.
  let talks = $state(untrack(() => profile?.talks ?? []));
  let loaded = $state(untrack(() => profile?.page ?? 1));
  let loading = $state(false);
  const remaining = $derived(
    profile ? profile.total - (profile.page - 1) * TALKS_PER_PAGE - talks.length : 0,
  );

  async function more() {
    if (!profile) {
      return;
    }
    loading = true;
    try {
      const next = await api<TalkPage>(
        `/api/people/${encodeURIComponent(profile.handle)}/talks?page=${loaded + 1}`,
      );
      const known = new Set(talks.map((talk) => talk.slug));
      const added = next.talks.filter((talk) => !known.has(talk.slug));
      talks = [...talks, ...added];
      loaded += 1;
      await tick();
      const first = added[0];
      if (first) {
        document
          .querySelector<HTMLElement>(`[data-slug="${CSS.escape(first.slug)}"] a`)
          ?.focus();
      }
    } catch {
      toast(t("profile.moreFailed"), { tone: "error" });
    } finally {
      loading = false;
    }
  }
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
        {#if profile.github}
          <a href="https://github.com/{profile.github}" rel="me noopener"><Icon name="github" size={14} />GitHub</a>
        {/if}
        <a href="{profilePath(profile.handle)}/rss" type="application/rss+xml"><Icon name="rss" size={14} />{t("profile.rss")}</a>
      </p>
    </header>

    <section aria-labelledby="talks-title">
      <h2 id="talks-title" class="visually-hidden">{t("profile.talks")}</h2>
      {#if profile.page > 1}
        <p class="newest"><a href={profileHref(profile.handle, view, 1)}><Icon name="arrow-up" size={14} />{t("profile.fromNewest")}</a></p>
      {/if}
      {#if profile.isOwner && talks.some((talk) => talk.visibility !== "public")}
        <p class="owner-note"><Icon name="lock" size={14} />{t("profile.ownerNote")}</p>
      {/if}
      {#if talks.length === 0}
        <div class="empty">
          <p>{profile.isOwner ? t("profile.emptyOwner") : t("profile.empty")}</p>
          {#if profile.isOwner}
            <CopyField value="dekc pub publish" label="dekc pub publish" kind="command" prompt />
            <a class="guide" href={docsUrl(lang, "guide/publish")} target="_blank" rel="noopener">{t("profile.howPublishing")}<Icon name="external" size={14} /></a>
          {/if}
        </div>
      {:else}
        <ProfileTalks {talks} handle={profile.handle} isOwner={profile.isOwner} {view} onview={choose} />
        <ProfileMore href={profileHref(profile.handle, view, loaded + 1)} {remaining} {loading} onmore={more} />
      {/if}
    </section>
  </div>
{/if}

<style>
  .page {
    max-width: var(--container);
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
  .newest {
    margin-bottom: var(--space-6);
    font-size: var(--text-sm);
  }
  .newest a {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
  }
  .owner-note {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-6);
    color: var(--text-muted);
    font-size: var(--text-sm);
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
  .guide {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
  }
  .empty :global(.field) {
    width: 100%;
    max-width: 360px;
  }
  @media (max-width: 639px) {
    .page {
      padding-top: var(--space-10);
    }
  }
</style>
