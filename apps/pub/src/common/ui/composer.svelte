<script lang="ts">
  import type { Snippet } from "svelte";
  import Button from "./button.svelte";
  import { dropDraft, keepDraft, readDraft } from "./drafts.ts";
  import { useI18n } from "./use-i18n.ts";

  let {
    placeholder,
    submitLabel,
    compact = false,
    autofocus = false,
    draftKey,
    oncancel,
    onsubmit,
    children,
  }: {
    placeholder: string;
    submitLabel: string;
    compact?: boolean;
    autofocus?: boolean;
    /** Where the unsent text is kept across a reload; with none, it is not kept. */
    draftKey?: string;
    oncancel?: () => void;
    /** Send the text, trimmed; true once it is sent, which empties the field. */
    onsubmit: (text: string) => Promise<boolean>;
    /** Controls of the caller's own, between the field and the buttons. */
    children?: Snippet;
  } = $props();

  const { t } = useI18n();
  let text = $state("");
  let sending = $state(false);
  let field: HTMLTextAreaElement | undefined = $state();
  const uid = $props.id();

  // Read after mounting: the server has no storage, and the page it rendered has an empty field.
  $effect(() => {
    const kept = draftKey ? readDraft(draftKey) : "";
    if (kept) {
      text = kept;
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
    if (!text.trim()) {
      field?.focus();
      return;
    }
    sending = true;
    const ok = await onsubmit(text.trim());
    sending = false;
    if (ok) {
      // Cleared here, not by watching the text: a new thread's composer is gone by now.
      if (draftKey) {
        dropDraft(draftKey);
      }
      text = "";
    }
  }

  function cancel() {
    if (draftKey) {
      dropDraft(draftKey);
    }
    oncancel?.();
  }

  function onkeydown(event: KeyboardEvent) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      submit();
    } else if (event.key === "Escape" && !text) {
      event.preventDefault();
      cancel();
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
  <label class="visually-hidden" for="dek-text-{uid}">{placeholder}</label>
  <textarea
    id="dek-text-{uid}"
    bind:this={field}
    bind:value={text}
    {placeholder}
    rows="1"
    maxlength="4000"
    {onkeydown}
    oninput={(event) => draftKey && keepDraft(draftKey, event.currentTarget.value)}
  ></textarea>
  {@render children?.()}
  <div class="row">
    <span class="hint" aria-hidden="true">{t("comment.shortcut")}</span>
    {#if oncancel}
      <Button variant="ghost" size="sm" onclick={cancel}>{t("common.cancel")}</Button>
    {/if}
    <Button variant="primary" size="sm" type="submit" loading={sending}>{submitLabel}</Button>
  </div>
</form>

<style>
  .composer {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  label {
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    color: var(--text);
  }
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
  textarea {
    min-height: 40px;
    max-height: calc(8lh + 16px);
    resize: none;
    field-sizing: content;
  }
  textarea:hover {
    border-color: var(--text-faint);
  }
  textarea:focus-visible {
    border-color: var(--accent);
    outline-offset: 0;
  }
  @media (min-width: 768px) {
    textarea {
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
</style>
