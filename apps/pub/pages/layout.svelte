<script lang="ts">
  import "../src/common/ui/tokens.css";
  import type { Snippet } from "svelte";
  import { startClock } from "../src/common/ui/clock.svelte.ts";
  import Toaster from "../src/common/ui/toaster.svelte";
  import Footer from "../src/shell/ui/footer.svelte";
  import Header from "../src/shell/ui/header.svelte";
  import { useApp } from "../src/shell/use-app.ts";

  let { children }: { children: Snippet } = $props();
  const { t } = useApp();
  $effect(startClock);
</script>

<a class="skip" href="#dek-main">{t("nav.skip")}</a>
<Header />
<main id="dek-main" tabindex="-1">
  {@render children()}
</main>
<Footer />
<Toaster />

<style>
  .skip {
    position: fixed;
    z-index: var(--z-tooltip);
    top: 8px;
    left: 8px;
    padding: 8px 12px;
    border-radius: var(--radius-sm);
    background: var(--surface-raised);
    box-shadow: var(--shadow-md);
    transform: translateY(-200%);
  }
  .skip:focus {
    transform: none;
  }
  main {
    display: block;
    min-height: calc(100dvh - var(--header-height) - 200px);
  }
  main:focus {
    outline: none;
  }
</style>
