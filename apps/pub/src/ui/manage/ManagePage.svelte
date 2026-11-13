<script lang="ts">
  import { untrack } from "svelte";
  import type { CommentPolicy, DeckStatus, ShareRequest, Visibility } from "../../../../../src/pub/protocol.ts";
  import { guessLang } from "../../lib/i18n.ts";
  import type { GrantView } from "../../server/pages.ts";
  import { ApiFailure, api } from "../api.ts";
  import { useApp } from "../app.ts";
  import Button from "../Button.svelte";
  import CopyField from "../CopyField.svelte";
  import Dialog from "../Dialog.svelte";
  import Icon from "../Icon.svelte";
  import SegmentedControl from "../SegmentedControl.svelte";
  import Switch from "../Switch.svelte";
  import { toast } from "../toast.svelte.ts";
  import VisibilityBadge from "../VisibilityBadge.svelte";
  import Sharing from "./Sharing.svelte";
  import Versions from "./Versions.svelte";

  let { status: initial, grants }: { status: DeckStatus; grants: GrantView[] } = $props();

  const { lang, t } = useApp();
  let status: DeckStatus = $state(untrack(() => initial));
  let saving: keyof ShareRequest | null = $state(null);
  let confirmPublic = $state(false);
  let visibilityControl: ReturnType<typeof SegmentedControl> | undefined = $state();
  let active = $state("overview");
  const talkPath = $derived(`/@${status.owner}/${status.slug}`);

  const sections = [
    { id: "overview", label: "manage.overview" },
    { id: "visibility", label: "visibility.label" },
    { id: "script", label: "manage.script" },
    { id: "comments", label: "manage.comments" },
    { id: "sharing", label: "manage.sharing" },
    { id: "versions", label: "manage.versions" },
  ] as const;

  const visibilityOptions = $derived([
    { value: "private" as const, label: t("visibility.private"), icon: "lock" as const },
    { value: "link" as const, label: t("visibility.link"), icon: "link" as const },
    { value: "public" as const, label: t("visibility.public"), icon: "globe" as const },
  ]);
  const commentOptions = $derived([
    { value: "off" as const, label: t("manage.comments.off") },
    { value: "signed-in" as const, label: t("manage.comments.signed-in") },
    { value: "guests" as const, label: t("manage.comments.guests") },
  ]);

  // The local nav follows the section being read.
  $effect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) {
          active = visible[0].target.id;
        }
      },
      { rootMargin: "-80px 0px -60% 0px" },
    );
    for (const section of sections) {
      const element = document.getElementById(section.id);
      if (element) {
        observer.observe(element);
      }
    }
    return () => observer.disconnect();
  });

  function message(error: unknown): string {
    if (error instanceof ApiFailure) {
      return error.code === "offline" ? t("common.offline") : t("common.error", { message: error.message });
    }
    return t("common.error", { message: "" });
  }

  async function save(change: ShareRequest, undoable = true) {
    const key = Object.keys(change)[0] as keyof ShareRequest;
    const before: ShareRequest = { [key]: status[key] } as ShareRequest;
    const previous = $state.snapshot(status);
    status = { ...status, ...change } as DeckStatus;
    saving = key;
    try {
      status = await api<DeckStatus>(`/api/decks/${status.id}`, { method: "PATCH", body: change });
      toast(t("saved"), undoable ? { action: { label: t("undo"), run: () => save(before, false) } } : {});
    } catch (error) {
      status = previous;
      toast(message(error), { tone: "error" });
    } finally {
      saving = null;
    }
  }

  function chooseVisibility(next: Visibility) {
    if (next === "public") {
      confirmPublic = true;
    } else {
      save({ visibility: next });
    }
  }
</script>

<div class="page">
  <header class="top">
    <a class="back" href={talkPath}><Icon name="arrow-left" size={14} />{t("manage.back")}</a>
    <h1 lang={guessLang([status.title], lang) ?? undefined}>{status.title}</h1>
  </header>

  <div class="layout">
    <nav class="local" aria-label={t("talk.manage")}>
      <ul>
        {#each sections as section (section.id)}
          <li>
            <a href="#{section.id}" aria-current={active === section.id ? "true" : undefined}>{t(section.label)}</a>
          </li>
        {/each}
      </ul>
    </nav>

    <div class="content">
      <section id="overview" class="section" aria-labelledby="overview-title">
        <h2 id="overview-title" class="visually-hidden">{t("manage.overview")}</h2>
        <div class="overview">
          <div class="overview-head">
            <VisibilityBadge visibility={status.visibility} />
            <span class="current num">v{status.current ?? "–"}</span>
          </div>
          <p class="label" id="url-label">{t("manage.url")}</p>
          <div class="url-row">
            <CopyField value={status.url} label={t("manage.url")} />
            <Button variant="secondary" href={talkPath} iconAfter="arrow-up-right">{t("manage.openTalk")}</Button>
          </div>
        </div>
      </section>

      <section id="visibility" class="section" aria-labelledby="visibility-title">
        <h2 id="visibility-title">{t("visibility.label")}</h2>
        <SegmentedControl
          bind:this={visibilityControl}
          label={t("visibility.label")}
          options={visibilityOptions}
          value={status.visibility}
          onselect={chooseVisibility}
          describedby="visibility-hint"
        />
        <p class="hint" id="visibility-hint">{t(`visibility.${status.visibility}.hint`)}</p>
      </section>

      <section id="script" class="section" aria-labelledby="script-title">
        <h2 id="script-title">{t("manage.script")}</h2>
        <Switch
          id="script-public"
          checked={status.scriptPublic}
          label={t("manage.script.toggle")}
          hint={t("manage.script.hint")}
          disabled={saving === "scriptPublic"}
          onchange={(next) => save({ scriptPublic: next })}
        />
        <div class="divider"></div>
        <Switch
          id="embed"
          checked={status.embed}
          label={t("manage.embed.toggle")}
          hint={t("manage.embed.hint")}
          disabled={saving === "embed"}
          onchange={(next) => save({ embed: next })}
        />
      </section>

      <section id="comments" class="section" aria-labelledby="comments-title">
        <h2 id="comments-title">{t("manage.comments")}</h2>
        <SegmentedControl
          label={t("manage.comments")}
          options={commentOptions}
          value={status.comments}
          onselect={(next: CommentPolicy) => save({ comments: next })}
          describedby="comments-hint"
        />
        <p class="hint" id="comments-hint">{t(`manage.comments.${status.comments}.hint`)}</p>
      </section>

      <section id="sharing" class="section" aria-labelledby="sharing-title">
        <h2 id="sharing-title">{t("manage.sharing")}</h2>
        <p class="hint">{t("manage.sharing.hint")}</p>
        {#if status.visibility === "link"}
          <div class="anyone">
            <Icon name="link" size={14} />
            <span>{t("manage.sharing.anyone")}</span>
          </div>
        {/if}
        <Sharing deckId={status.id} initial={grants} />
      </section>

      <section id="versions" class="section" aria-labelledby="versions-title">
        <h2 id="versions-title">{t("manage.versions")}</h2>
        <p class="hint">{t("manage.versions.hint")}</p>
        <Versions {status} onchange={(next) => (status = next)} />
      </section>
    </div>
  </div>
</div>

<Dialog
  bind:open={confirmPublic}
  title={t("visibility.confirmTitle", { title: status.title })}
  onclose={() => {
    // Declined or done, focus goes back to the option now chosen, which is the group's tab stop.
    queueMicrotask(() => visibilityControl?.focusChosen());
  }}
>
  <p>{t("visibility.confirmBody")}</p>
  {#snippet actions()}
    <Button variant="secondary" autofocus onclick={() => (confirmPublic = false)}>{t("common.cancel")}</Button>
    <Button
      variant="primary"
      icon="globe"
      onclick={() => {
        confirmPublic = false;
        save({ visibility: "public" });
      }}>{t("visibility.confirm")}</Button
    >
  {/snippet}
</Dialog>

<style>
  .page {
    max-width: 960px;
    margin: 0 auto;
    padding: var(--space-10) var(--page-gutter) 0;
  }
  .top {
    margin-bottom: var(--space-8);
  }
  .back {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-bottom: var(--space-3);
    color: var(--text-muted);
    font-size: var(--text-sm);
    text-decoration: none;
  }
  .back:hover {
    color: var(--text);
  }
  h1 {
    font-size: var(--text-2xl);
  }
  .layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-8);
  }
  @media (min-width: 900px) {
    .layout {
      grid-template-columns: 200px minmax(0, 720px);
      gap: var(--space-10);
    }
  }
  .local ul {
    display: flex;
    gap: 2px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .local a {
    display: block;
    padding: 6px 10px;
    border-radius: var(--radius-sm);
    color: var(--text-muted);
    font-size: var(--text-md);
    font-weight: var(--weight-medium);
    text-decoration: none;
    white-space: nowrap;
  }
  .local a:hover {
    background: var(--bg-subtle);
    color: var(--text);
  }
  .local a[aria-current="true"] {
    background: var(--bg-active);
    color: var(--text);
  }
  @media (min-width: 900px) {
    .local {
      position: sticky;
      top: calc(var(--header-height) + var(--space-6));
      align-self: start;
    }
    .local ul {
      flex-direction: column;
    }
  }
  @media (max-width: 899px) {
    .local {
      position: sticky;
      top: var(--header-height);
      z-index: var(--z-sticky);
      margin: 0 calc(-1 * var(--page-gutter));
      padding: var(--space-2) var(--page-gutter);
      border-bottom: 1px solid var(--border);
      background: var(--header-bg);
      backdrop-filter: blur(8px);
      overflow-x: auto;
      scrollbar-width: none;
    }
  }
  .content {
    min-width: 0;
  }
  .section {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-8) 0;
    border-top: 1px solid var(--border);
    scroll-margin-top: calc(var(--header-height) + var(--space-12));
  }
  .section:first-child {
    padding-top: 0;
    border-top: 0;
  }
  h2 {
    font-size: var(--text-lg);
  }
  .hint {
    color: var(--text-muted);
    font-size: var(--text-sm);
  }
  .overview {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-5);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface);
  }
  .overview-head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .current {
    color: var(--text-faint);
    font-family: var(--font-mono);
    font-size: var(--text-xs);
  }
  .label {
    margin-top: var(--space-1);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
  }
  .url-row {
    display: flex;
    gap: var(--space-2);
  }
  .url-row > :global(:first-child) {
    flex: 1;
  }
  .url-row :global(.btn) {
    height: 44px;
  }
  @media (max-width: 639px) {
    .url-row {
      flex-direction: column;
    }
  }
  .divider {
    height: 1px;
    margin: var(--space-2) 0;
    background: var(--border);
  }
  .anyone {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3);
    border-radius: var(--radius-sm);
    background: var(--accent-subtle);
    color: var(--accent);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
  }
</style>
