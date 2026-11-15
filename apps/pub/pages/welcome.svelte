<script lang="ts">
  import HandleForm from "../src/model/person/feature/choose-handle/ui/handle-form.svelte";
  import { useApp } from "../src/shell/use-app.ts";
  import type { Props } from "./welcome.server";

  let { next, suggestion }: Props = $props();
  const { t } = useApp();
</script>

<div class="page">
  <section class="card" aria-labelledby="welcome-title">
    <h1 id="welcome-title">{t("welcome.title")}</h1>
    <p class="lead">{t("welcome.lead")}</p>
    <HandleForm {suggestion} onchosen={() => (window.location.href = next)} />
  </section>
</div>

<style>
  .page {
    display: flex;
    justify-content: center;
    padding: 12vh var(--page-gutter) var(--space-16);
  }
  .card {
    width: 100%;
    max-width: 400px;
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  h1 {
    font-size: var(--text-2xl);
  }
  .lead {
    margin-bottom: var(--space-2);
    color: var(--text-muted);
    font-size: var(--text-sm);
    line-height: var(--leading-ui);
  }
</style>
