<script lang="ts">
  
  import Button from "../../common/ui/button.svelte";
import { useApp } from "../use-app.ts";

  const { shared, t } = useApp();
</script>

<section class="not-found" aria-labelledby="nf-title">
  <p class="code" aria-hidden="true">404</p>
  <h1 id="nf-title">{t("404.title")}</h1>
  <p class="body">{t("404.body")}</p>
  <div class="actions">
    <Button variant="primary" href="/">{t("404.home")}</Button>
    {#if !shared.viewer}
      <Button variant="secondary" href="/signin">{t("404.signin")}</Button>
    {/if}
  </div>
</section>

<style>
  .not-found {
    max-width: 480px;
    margin: 0 auto;
    padding: 15vh var(--page-gutter) var(--space-16);
    text-align: center;
  }
  .code {
    margin-bottom: var(--space-4);
    color: var(--text-faint);
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    letter-spacing: 0.2em;
  }
  h1 {
    font-size: var(--text-2xl);
  }
  .body {
    margin-top: var(--space-3);
    color: var(--text-muted);
    font-size: var(--text-base);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--space-2);
    margin-top: var(--space-8);
  }
</style>
