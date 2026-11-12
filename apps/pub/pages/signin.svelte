<script lang="ts">
  import { auth } from "void/client";
  import { useApp } from "../src/ui/app.ts";
  import Button from "../src/ui/Button.svelte";
  import Icon from "../src/ui/Icon.svelte";
  import type { Props } from "./signin.server";

  let { next }: Props = $props();
  const { shared, t } = useApp();

  let github = $state(false);
  let mode: "signin" | "signup" = $state("signin");
  let name = $state("");
  let email = $state("");
  let password = $state("");
  let busy = $state(false);
  let error = $state("");

  async function withGitHub() {
    github = true;
    error = "";
    const result = await auth.signIn.social({ provider: "github", callbackURL: next });
    if (result?.error) {
      github = false;
      error = t("signin.failed", { message: result.error.message ?? result.error.statusText ?? "" });
    }
  }

  async function withEmail(event: SubmitEvent) {
    event.preventDefault();
    busy = true;
    error = "";
    const result =
      mode === "signup"
        ? await auth.signUp.email({ name, email, password })
        : await auth.signIn.email({ email, password });
    if (result?.error) {
      busy = false;
      error = t("signin.failed", { message: result.error.message ?? result.error.statusText ?? "" });
      return;
    }
    window.location.href = next;
  }
</script>

<div class="page">
  <section class="card" aria-labelledby="signin-title">
    <h1 id="signin-title">{t("signin.title")}</h1>

    {#if shared.viewer}
      <p class="already">{t("signin.already", { handle: shared.viewer.handle })}</p>
      <Button variant="primary" size="lg" full href={next}>{t("signin.continue")}</Button>
    {:else}
      <Button variant="neutral" size="lg" full icon="github" loading={github} onclick={withGitHub}>
        {t("signin.github")}
      </Button>
      <p class="note">{t("signin.note")}</p>

      {#if shared.devLogin}
        <form class="dev" onsubmit={withEmail}>
          <div class="dev-head">
            <span class="dev-badge"><Icon name="terminal" size={12} />DEV</span>
            <h2>{t("signin.devTitle")}</h2>
          </div>
          <p class="dev-note">{t("signin.devNote")}</p>
          {#if mode === "signup"}
            <div class="field">
              <label for="name">{t("signin.name")}</label>
              <input id="name" bind:value={name} autocomplete="name" required />
            </div>
          {/if}
          <div class="field">
            <label for="email">{t("signin.email")}</label>
            <input id="email" type="email" bind:value={email} autocomplete="email" required />
          </div>
          <div class="field">
            <label for="password">{t("signin.password")}</label>
            <input
              id="password"
              type="password"
              bind:value={password}
              autocomplete={mode === "signup" ? "new-password" : "current-password"}
              minlength="8"
              required
            />
          </div>
          <Button variant="secondary" full type="submit" loading={busy}>
            {mode === "signup" ? t("signin.create") : t("signin.submit")}
          </Button>
          <button type="button" class="switch" onclick={() => (mode = mode === "signup" ? "signin" : "signup")}>
            {mode === "signup" ? t("signin.toSignin") : t("signin.toCreate")}
          </button>
        </form>
      {/if}
    {/if}
    {#if error}
      <p class="error" role="alert"><Icon name="alert" size={14} />{error}</p>
    {/if}
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
    margin-bottom: var(--space-4);
    font-size: var(--text-2xl);
  }
  .note,
  .already {
    color: var(--text-muted);
    font-size: var(--text-sm);
    line-height: var(--leading-ui);
  }
  .dev {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    margin-top: var(--space-6);
    padding: var(--space-5);
    border: 1px dashed var(--border-strong);
    border-radius: var(--radius-md);
    background: var(--warning-subtle);
  }
  .dev-head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .dev-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 20px;
    padding: 0 6px;
    border-radius: var(--radius-xs);
    background: var(--warning);
    color: var(--warning-subtle);
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
  }
  h2 {
    font-size: var(--text-md);
    letter-spacing: 0;
  }
  .dev-note {
    color: var(--warning);
    font-size: var(--text-sm);
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  label {
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
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
    outline-offset: 0;
  }
  .switch {
    align-self: center;
    padding: 4px;
    border: 0;
    background: none;
    color: var(--accent);
    font-size: var(--text-sm);
    cursor: pointer;
  }
  .switch:hover {
    text-decoration: underline;
  }
  .error {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    color: var(--danger);
    font-size: var(--text-sm);
  }
  .error :global(svg) {
    margin-top: 3px;
  }
</style>
