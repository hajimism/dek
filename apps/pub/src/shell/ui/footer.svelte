<script lang="ts">
  import { docsUrl } from "../../common/docs.ts";
  import type { Lang } from "../../common/i18n.ts";
  import Icon from "../../common/ui/icon.svelte";
  import { langHref } from "../lang-link.ts";
  import { useApp } from "../use-app.ts";

  const { lang, t } = useApp();
  // Each language by its own name, so a reader finds theirs whichever the page is in.
  const languages: ReadonlyArray<{ value: Lang; name: string }> = [
    { value: "ja", name: "日本語" },
    { value: "en", name: "English" },
  ];

  function choose(event: Event & { currentTarget: HTMLSelectElement }) {
    window.location.href = langHref(new URL(window.location.href), event.currentTarget.value as Lang);
  }
</script>

<footer class="footer">
  <div class="inner">
    <p class="built">
      <a href="/" class="name">dek.pub</a>
      <span aria-hidden="true">·</span>
      <a href={docsUrl(lang)} lang="en">{t("footer.builtWith")}</a>
    </p>
    <nav aria-label="Footer">
      <a href="/about">{t("footer.about")}</a>
      <a href={docsUrl(lang)}>{t("footer.docs")}</a>
      <a href="https://github.com/hajimism/dek">{t("footer.source")}</a>
    </nav>
    <label class="lang">
      <Icon name="globe" size={14} />
      <span class="visually-hidden">{t("lang.label")}</span>
      <select value={lang} onchange={choose}>
        {#each languages as language (language.value)}
          <option value={language.value} lang={language.value}>{language.name}</option>
        {/each}
      </select>
    </label>
  </div>
</footer>

<style>
  .footer {
    margin-top: var(--space-24);
    border-top: 1px solid var(--border);
    color: var(--text-muted);
    font-size: var(--text-sm);
  }
  .inner {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3) var(--space-6);
    max-width: var(--container);
    margin: 0 auto;
    padding: var(--space-8) var(--page-gutter) calc(var(--space-8) + env(safe-area-inset-bottom));
  }
  .built {
    display: flex;
    gap: var(--space-2);
  }
  .name {
    color: var(--text);
    font-weight: var(--weight-semibold);
  }
  nav {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1) var(--space-5);
  }
  a {
    color: inherit;
    text-decoration: none;
  }
  a:hover {
    color: var(--text);
    text-decoration: underline;
  }
  .lang {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  select {
    height: 32px;
    padding: 0 var(--space-6) 0 var(--space-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface)
      url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%23888' stroke-width='1.5'%3E%3Cpath d='M4 6l4 4 4-4'/%3E%3C/svg%3E")
      no-repeat right 8px center / 12px;
    color: var(--text);
    font: inherit;
    appearance: none;
    cursor: pointer;
  }
  select:hover {
    border-color: var(--border-hover);
  }
</style>
