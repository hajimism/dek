<script lang="ts">
  import { formatUserCode } from "../lib/device-code.ts";

  let {
    value = $bindable(""),
    label,
    error = "",
    id = "device-code",
  }: { value?: string; label: string; error?: string; id?: string } = $props();

  function oninput(event: Event & { currentTarget: HTMLInputElement }) {
    const input = event.currentTarget;
    const before = input.value;
    const caret = input.selectionStart ?? before.length;
    // Keep the caret after the same number of letters and digits it was after.
    const kept = before.slice(0, caret).replace(/[^a-z0-9]/gi, "").length;
    value = formatUserCode(before);
    input.value = value;
    let at = 0;
    let seen = 0;
    while (at < value.length && seen < kept) {
      if (/[A-Z0-9]/.test(value.charAt(at))) {
        seen++;
      }
      at++;
    }
    input.setSelectionRange(at, at);
  }
</script>

<label class="visually-hidden" for={id}>{label}</label>
<input
  {id}
  name="user_code"
  class="code"
  class:invalid={!!error}
  {value}
  {oninput}
  placeholder="XXXX-XXXX"
  autocomplete="one-time-code"
  inputmode="text"
  autocapitalize="characters"
  autocorrect="off"
  spellcheck="false"
  maxlength="9"
  aria-invalid={error ? "true" : undefined}
  aria-describedby={error ? `${id}-error` : undefined}
/>
{#if error}
  <p class="error" id="{id}-error" role="alert">{error}</p>
{/if}

<style>
  .code {
    width: 100%;
    height: 64px;
    padding: 0 16px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--text);
    font-family: var(--font-mono);
    font-size: 28px;
    font-weight: var(--weight-medium);
    letter-spacing: 0.12em;
    text-align: center;
    text-transform: uppercase;
    font-variant-numeric: tabular-nums;
  }
  .code::placeholder {
    color: var(--border-hover);
  }
  .code:hover {
    border-color: var(--text-faint);
  }
  .code:focus-visible {
    border-color: var(--accent);
    outline-offset: 0;
  }
  .code.invalid {
    border-color: var(--danger);
  }
  .error {
    margin-top: var(--space-2);
    color: var(--danger);
    font-size: var(--text-sm);
  }
</style>
