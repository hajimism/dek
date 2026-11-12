<script lang="ts">
  import { useApp } from "./app.ts";

  const { lang, t } = useApp();
</script>

<footer class="footer">
  <div class="inner">
    <p class="built">
      <a href="/" class="name">dek.pub</a>
      <span aria-hidden="true">·</span>
      <a href="https://hajimism.github.io/dek/{lang === 'ja' ? 'ja/' : ''}">{t("footer.builtWith")}</a>
    </p>
    <nav aria-label="Footer">
      <a href="https://hajimism.github.io/dek/{lang === 'ja' ? 'ja/' : ''}">{t("footer.docs")}</a>
      <a href="https://github.com/hajimism/dek">{t("footer.source")}</a>
      <a href={lang === "ja" ? "?lang=en" : "?lang=ja"} lang={lang === "ja" ? "en" : "ja"}>{lang === "ja" ? "English" : "日本語"}</a>
    </nav>
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
</style>
