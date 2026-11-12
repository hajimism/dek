<script lang="ts">
  import "../src/ui/tokens.css";
  import type { Snippet } from "svelte";
  import { useApp } from "../src/ui/app.ts";
  import Footer from "../src/ui/Footer.svelte";
  import Header from "../src/ui/Header.svelte";
  import Toaster from "../src/ui/Toaster.svelte";

  let { children }: { children: Snippet } = $props();
  const { t } = useApp();
</script>

<a class="skip" href="#main">{t("nav.skip")}</a>
<Header />
<main id="main" tabindex="-1">
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
