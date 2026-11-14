<script lang="ts">
  import { auth } from "void/client";
  import Icon from "../../common/ui/icon.svelte";
  import Menu from "../../common/ui/menu.svelte";
  import { profilePath } from "../../model/person/profile-path.ts";
  import { signInHref } from "../../model/person/sign-in-path.ts";
  import Avatar from "../../model/person/ui/avatar.svelte";
  import { applyTheme } from "../theme.ts";
  import type { Theme } from "../type.ts";
  import { useApp } from "../use-app.ts";

  const { shared, t } = useApp();
  let theme: Theme = $state(shared.theme);
  let scrolled = $state(false);

  $effect(() => {
    const onScroll = () => (scrolled = window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  });

  const themes = [
    { value: "system", icon: "monitor" },
    { value: "light", icon: "sun" },
    { value: "dark", icon: "moon" },
  ] as const;
  // The button shows the theme the page is in, not the choice. Under the system's, only the
  // browser knows which that is, so both icons are drawn and the color scheme keeps one.
  const themeIcon = $derived(theme === "dark" ? "moon" : "sun");

  async function signOut() {
    await auth.signOut();
    window.location.href = "/";
  }

  /** The sign-in page, coming back to the page as it is now. */
  function signInHere(): string {
    return signInHref(window.location.pathname + window.location.search + window.location.hash);
  }
</script>

<header class="header" class:scrolled>
  <div class="inner">
    <a class="wordmark" href="/" aria-label="dek.pub">
      <span class="mark" aria-hidden="true"></span><span>dek<span class="dot">.</span>pub</span>
    </a>
    <div class="tools">
      <Menu label="{t('theme.label')}: {t(`theme.${theme}`)}">
        {#snippet trigger()}
          {#if theme === "system"}
            <span class="follows light"><Icon name="sun" /></span><span class="follows dark"><Icon name="moon" /></span>
          {:else}
            <Icon name={themeIcon} />
          {/if}
        {/snippet}
        {#snippet children(close)}
          {#each themes as entry (entry.value)}
            <button
              type="button"
              role="menuitemradio"
              aria-checked={theme === entry.value}
              onclick={() => {
                theme = entry.value;
                applyTheme(entry.value);
                close();
              }}
            >
              <Icon name={entry.icon} />
              {t(`theme.${entry.value}`)}
              {#if theme === entry.value}<span class="menu-check"><Icon name="check" size={14} /></span>{/if}
            </button>
          {/each}
        {/snippet}
      </Menu>
      {#if shared.viewer}
        {@const viewer = shared.viewer}
        <Menu label={t("nav.account")} triggerClass="avatar-trigger">
          {#snippet trigger()}<Avatar name={viewer.name} image={viewer.image} size={28} />{/snippet}
          {#snippet children()}
            <div class="menu-meta">
              {t("nav.signedInAs")}<br /><strong class="who">{viewer.handle ? `@${viewer.handle}` : viewer.name}</strong>
            </div>
            <hr />
            {#if viewer.handle}
              <a role="menuitem" href={profilePath(viewer.handle)}><Icon name="user" />{t("nav.profile")}</a>
            {/if}
            <button type="button" role="menuitem" onclick={signOut}><Icon name="signout" />{t("nav.signout")}</button>
          {/snippet}
        </Menu>
      {:else}
        <a class="signin" href="/signin" onclick={(event) => (event.currentTarget.href = signInHere())}>{t("nav.signin")}</a>
      {/if}
    </div>
  </div>
</header>

<style>
  .header {
    position: sticky;
    top: 0;
    z-index: var(--z-header);
    height: var(--header-height);
    background: var(--header-bg);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    border-bottom: 1px solid transparent;
    transition: border-color var(--dur-base) var(--ease-out);
  }
  .header.scrolled {
    border-bottom-color: var(--border);
  }
  .inner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    height: 100%;
    max-width: var(--container);
    margin: 0 auto;
    padding: 0 var(--page-gutter);
  }
  .wordmark {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: var(--text);
    font-size: 1rem;
    font-weight: var(--weight-semibold);
    letter-spacing: -0.02em;
    text-decoration: none;
  }
  .wordmark:hover {
    color: var(--text);
  }
  .mark {
    width: 18px;
    height: 12px;
    border-radius: 2px;
    border: 1.5px solid currentColor;
    box-shadow: inset 0 -3px 0 -1.5px var(--bg), inset 0 -4.5px 0 -1.5px currentColor;
  }
  .dot {
    color: var(--accent);
  }
  .tools {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }
  .follows {
    display: contents;
  }
  .follows.dark {
    display: none;
  }
  @media (prefers-color-scheme: dark) {
    .follows.light {
      display: none;
    }
    .follows.dark {
      display: contents;
    }
  }
  .signin {
    display: inline-flex;
    align-items: center;
    height: 36px;
    padding: 0 10px;
    border-radius: var(--radius-sm);
    color: var(--text-muted);
    font-size: var(--text-md);
    font-weight: var(--weight-medium);
    text-decoration: none;
  }
  .signin {
    margin-left: var(--space-1);
    border: 1px solid var(--border-strong);
    background: var(--surface);
    color: var(--text);
  }
  .signin:hover {
    background: var(--bg-subtle);
    color: var(--text);
  }
  .who {
    color: var(--text);
    font-weight: var(--weight-medium);
  }
</style>
