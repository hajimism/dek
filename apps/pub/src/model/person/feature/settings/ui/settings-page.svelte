<script lang="ts">
  // A person's settings, one section to each thing they set: who they are on dek.pub, and the
  // links their profile shows. Each section saves on its own.
  import { untrack } from "svelte";
  import Button from "../../../../../common/ui/button.svelte";
  import Icon from "../../../../../common/ui/icon.svelte";
  import { toast } from "../../../../../common/ui/toast.svelte.ts";
  import { useI18n } from "../../../../../common/ui/use-i18n.ts";
  import { MAX_LINKS } from "../../../link.ts";
  import { MAX_NAME_LENGTH, type NameProblem, readName } from "../../../name.ts";
  import { profilePath } from "../../../profile-path.ts";
  import { saveName } from "../settings-api.ts";
  import type { SaveFailure } from "../type.ts";
  import LinksEditor from "./links-editor.svelte";

  let { handle, name: initial, links }: { handle: string; name: string; links: string[] } = $props();
  const { t } = useI18n();

  let name = $state(untrack(() => initial));
  let nameProblem: string | null = $state(null);
  let savingName = $state(false);

  function nameText(problem: NameProblem | SaveFailure, message: string): string {
    switch (problem) {
      case "empty":
        return t("settings.name.empty");
      case "too_long":
        return t("settings.name.too_long", { n: MAX_NAME_LENGTH });
      case "offline":
        return t("common.offline");
      default:
        return t("common.error", { message });
    }
  }

  async function submitName(event: SubmitEvent) {
    event.preventDefault();
    if (savingName) {
      return;
    }
    const read = readName(name);
    if (!read.ok) {
      nameProblem = nameText(read.problem, "");
      return;
    }
    savingName = true;
    const result = await saveName(read.name);
    savingName = false;
    if (!result.ok) {
      nameProblem = nameText(result.problem, result.message);
      return;
    }
    name = result.value;
    nameProblem = null;
    toast(t("saved"));
  }
</script>

<div class="page">
  <h1>{t("settings.title")}</h1>

  <section id="profile" class="section" aria-labelledby="profile-title">
    <h2 id="profile-title">{t("settings.profile")}</h2>
    <div class="field">
      <p class="label">{t("settings.handle")}</p>
      <p class="handle">@{handle}</p>
      <p class="hint">{t("settings.handle.hint")} <a href={profilePath(handle)}>{t("settings.viewProfile")}</a></p>
    </div>
    <form class="field" onsubmit={submitName} novalidate>
      <label class="label" for="name">{t("settings.name")}</label>
      <input
        id="name"
        bind:value={name}
        oninput={() => (nameProblem = null)}
        autocomplete="name"
        maxlength={MAX_NAME_LENGTH * 2}
        aria-invalid={nameProblem !== null}
        aria-describedby="name-hint"
      />
      <p class="hint" class:problem={nameProblem !== null} id="name-hint" aria-live="polite">
        {#if nameProblem}<Icon name="alert" size={14} />{nameProblem}{:else}{t("settings.name.hint")}{/if}
      </p>
      <div class="actions">
        <Button variant="primary" type="submit" loading={savingName} disabled={savingName}>{t("settings.name.save")}</Button>
      </div>
    </form>
  </section>

  <section id="links" class="section" aria-labelledby="links-title">
    <h2 id="links-title">{t("settings.links")}</h2>
    <p class="hint">{t("settings.links.hint", { n: MAX_LINKS })}</p>
    <LinksEditor {links} />
  </section>
</div>

<style>
  /* One column on the site's left edge, as the header has it; every block is the column's width. */
  .page {
    max-width: var(--container);
    margin: 0 auto;
    padding: var(--space-10) var(--page-gutter) 0;
  }
  .page > :global(*) {
    max-width: var(--measure);
  }
  h1 {
    margin-bottom: var(--space-8);
    font-size: var(--text-2xl);
  }
  .section {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: var(--space-8) 0;
    border-top: 1px solid var(--border);
  }
  h1 + .section {
    padding-top: 0;
    border-top: 0;
  }
  h2 {
    font-size: var(--text-lg);
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .label {
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
  }
  .handle {
    font-family: var(--font-mono);
    font-size: var(--text-base);
  }
  input {
    height: 40px;
    padding: 0 12px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    background: var(--surface);
    font-size: var(--text-base);
  }
  input:hover {
    border-color: var(--text-faint);
  }
  input:focus-visible {
    border-color: var(--accent);
    outline: none;
  }
  input[aria-invalid="true"] {
    border-color: var(--danger);
  }
  .hint {
    color: var(--text-muted);
    font-size: var(--text-sm);
    line-height: var(--leading-ui);
  }
  .hint :global(svg) {
    margin-right: 6px;
    vertical-align: -2px;
  }
  .hint.problem {
    color: var(--danger);
  }
  /* Japanese is set flush on both sides, as it is in print. */
  .page:lang(ja) .hint {
    text-align: justify;
    text-autospace: ideograph-alpha ideograph-numeric;
  }
  .actions {
    display: flex;
    margin-top: var(--space-3);
  }
</style>
