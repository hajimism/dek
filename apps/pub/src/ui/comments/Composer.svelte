<script lang="ts" module>
  const NAME_KEY = "dek-pub:guest-name";

  export function rememberedGuestName(): string {
    try {
      return localStorage.getItem(NAME_KEY) ?? "";
    } catch {
      return "";
    }
  }

  function rememberGuestName(name: string): void {
    try {
      localStorage.setItem(NAME_KEY, name);
    } catch {
      // A private window keeps nothing; the name is asked again next time.
    }
  }
</script>

<script lang="ts">
  import type { ReplyInput } from "./CommentCard.svelte";
  import { useApp } from "../app.ts";
  import Button from "../Button.svelte";
  import Turnstile from "./Turnstile.svelte";

  let {
    guest = false,
    placeholder,
    submitLabel,
    compact = false,
    autofocus = false,
    oncancel,
    onsubmit,
  }: {
    guest?: boolean;
    placeholder?: string;
    submitLabel?: string;
    compact?: boolean;
    autofocus?: boolean;
    oncancel?: () => void;
    onsubmit: (input: ReplyInput) => Promise<boolean>;
  } = $props();

  const { shared, t } = useApp();
  let text = $state("");
  let guestName = $state("");
  let token = $state("");
  let resetKey = $state(0);
  let sending = $state(false);
  let error = $state("");
  let field: HTMLTextAreaElement | undefined = $state();
  const uid = $props.id();

  $effect(() => {
    if (guest && !guestName) {
      guestName = rememberedGuestName();
    }
  });

  $effect(() => {
    if (autofocus && field) {
      field.focus({ preventScroll: true });
    }
  });

  export function focus() {
    field?.focus();
  }

  async function submit() {
    error = "";
    if (!text.trim()) {
      field?.focus();
      return;
    }
    if (guest && !guestName.trim()) {
      error = t("comment.guestName");
      document.getElementById(`dek-guest-${uid}`)?.focus();
      return;
    }
    sending = true;
    if (guest) {
      rememberGuestName(guestName.trim());
    }
    const ok = await onsubmit({
      text: text.trim(),
      ...(guest ? { guestName: guestName.trim() } : {}),
      ...(guest && token ? { turnstile: token } : {}),
    });
    sending = false;
    if (ok) {
      text = "";
    }
    if (guest && shared.turnstileSiteKey) {
      resetKey++;
    }
  }

  function onkeydown(event: KeyboardEvent) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      submit();
    } else if (event.key === "Escape" && !text) {
      event.preventDefault();
      oncancel?.();
    }
  }
</script>

<form
  class="composer"
  class:compact
  onsubmit={(event) => {
    event.preventDefault();
    submit();
  }}
>
  {#if guest}
    <div class="guest">
      <label for="dek-guest-{uid}">{t("comment.guestName")}</label>
      <input id="dek-guest-{uid}" bind:value={guestName} autocomplete="name" maxlength="60" required />
    </div>
  {/if}
  <label class="visually-hidden" for="dek-text-{uid}">{placeholder ?? t("comment.placeholder")}</label>
  <textarea
    id="dek-text-{uid}"
    bind:this={field}
    bind:value={text}
    placeholder={placeholder ?? t("comment.placeholder")}
    rows="1"
    maxlength="4000"
    {onkeydown}
  ></textarea>
  {#if guest && shared.turnstileSiteKey}
    <Turnstile siteKey={shared.turnstileSiteKey} bind:token {resetKey} />
  {/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  <div class="row">
    <span class="hint" aria-hidden="true">{t("comment.shortcut")}</span>
    {#if oncancel}
      <Button variant="ghost" size="sm" onclick={oncancel}>{t("common.cancel")}</Button>
    {/if}
    <Button variant="primary" size="sm" type="submit" loading={sending}>
      {submitLabel ?? t("comment.post")}
    </Button>
  </div>
</form>

<style>
  .composer {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .guest {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  label {
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    color: var(--text);
  }
  input,
  textarea {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--text);
    font-size: var(--text-base);
    line-height: var(--leading-ui);
    transition: border-color var(--dur-instant) var(--ease-out);
  }
  input {
    height: 40px;
  }
  textarea {
    min-height: 40px;
    max-height: calc(8lh + 16px);
    resize: none;
    field-sizing: content;
  }
  input:hover,
  textarea:hover {
    border-color: var(--text-faint);
  }
  input:focus-visible,
  textarea:focus-visible {
    border-color: var(--accent);
    outline-offset: 0;
  }
  @media (min-width: 768px) {
    textarea,
    input {
      font-size: var(--text-md);
    }
  }
  .compact textarea {
    min-height: 36px;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-2);
  }
  .hint {
    margin-right: auto;
    color: var(--text-faint);
    font-size: var(--text-xs);
  }
  @media (pointer: coarse) {
    .hint {
      visibility: hidden;
    }
  }
  .error {
    color: var(--danger);
    font-size: var(--text-sm);
  }
</style>
