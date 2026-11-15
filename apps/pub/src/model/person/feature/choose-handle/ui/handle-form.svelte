<script lang="ts">
  import { untrack } from "svelte";
  import Button from "../../../../../common/ui/button.svelte";
  import Icon from "../../../../../common/ui/icon.svelte";
  import { useI18n } from "../../../../../common/ui/use-i18n.ts";
  import { handleProblem, normalizeHandle } from "../../../handle.ts";
  import { checkHandle, chooseHandle } from "../handle-api.ts";
  import type { HandleCheck } from "../type.ts";

  let { suggestion, onchosen }: { suggestion: string | null; onchosen: (handle: string) => void } =
    $props();
  const { t } = useI18n();

  /** How long typing rests before dek.pub is asked whether the handle is free. */
  const REST_MS = 250;

  let value = $state(untrack(() => suggestion ?? ""));
  let check: HandleCheck | null = $state(null);
  let saving = $state(false);
  const handle = $derived(normalizeHandle(value));

  // What the rules alone refuse is said at once; only a handle they allow is asked about.
  $effect(() => {
    const asked = handle;
    const problem = asked === "" ? null : handleProblem(asked);
    if (asked === "" || problem) {
      check = problem ? { handle: asked, state: "problem", problem } : null;
      return;
    }
    check = { handle: asked, state: "checking" };
    let stale = false;
    const timer = setTimeout(async () => {
      const status = await checkHandle(asked);
      if (!stale) {
        check =
          status === "free"
            ? { handle: asked, state: "free" }
            : { handle: asked, state: "problem", problem: status };
      }
    }, REST_MS);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  });

  const message = $derived.by(() => {
    if (check === null) {
      return t("welcome.rule");
    }
    const vars = { handle: check.handle };
    if (check.state !== "problem") {
      return t(check.state === "free" ? "welcome.free" : "welcome.checking", vars);
    }
    switch (check.problem) {
      case "invalid":
        return t("welcome.invalid");
      case "reserved":
        return t("welcome.reserved", vars);
      case "taken":
        return t("welcome.taken", vars);
      case "chosen":
        return t("welcome.chosen");
      case "offline":
        return t("common.offline");
      default:
        return t("common.error", { message: "" });
    }
  });

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (check?.state !== "free" || saving) {
      return;
    }
    const chosen = check.handle;
    saving = true;
    const result = await chooseHandle(chosen);
    if (result.ok) {
      onchosen(chosen);
      return;
    }
    saving = false;
    check = { handle: chosen, state: "problem", problem: result.problem };
  }
</script>

<form class="form" onsubmit={submit} novalidate>
  <label for="handle">{t("welcome.label")}</label>
  <div class="field" class:invalid={check?.state === "problem"}>
    <span class="at" aria-hidden="true">@</span>
    <input
      id="handle"
      name="handle"
      bind:value
      autocomplete="username"
      autocapitalize="none"
      spellcheck="false"
      aria-describedby="handle-status"
      aria-invalid={check?.state === "problem"}
      required
    />
  </div>
  <p id="handle-status" class="status" class:free={check?.state === "free"} class:problem={check?.state === "problem"} aria-live="polite">
    {#if check?.state === "free"}<Icon name="check" size={14} />{:else if check?.state === "problem"}<Icon name="alert" size={14} />{/if}{message}
  </p>
  <Button variant="primary" size="lg" full type="submit" loading={saving} disabled={check?.state !== "free" || saving}>
    {t("welcome.submit")}
  </Button>
</form>

<style>
  .form {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  label {
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
  }
  .field {
    display: flex;
    align-items: center;
    height: 44px;
    padding: 0 12px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    background: var(--surface);
  }
  .field:hover {
    border-color: var(--text-faint);
  }
  .field:focus-within {
    border-color: var(--accent);
  }
  .field.invalid {
    border-color: var(--danger);
  }
  .at {
    color: var(--text-faint);
    font-family: var(--font-mono);
  }
  input {
    flex: 1;
    min-width: 0;
    height: 100%;
    padding: 0 0 0 2px;
    border: 0;
    background: none;
    font-family: var(--font-mono);
    font-size: var(--text-base);
  }
  input:focus-visible {
    outline: none;
  }
  .status {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    min-height: 1.5em;
    margin-bottom: var(--space-3);
    color: var(--text-muted);
    font-size: var(--text-sm);
    line-height: var(--leading-ui);
  }
  .status :global(svg) {
    flex: none;
    margin-top: 3px;
  }
  .status.free :global(svg) {
    color: var(--success);
  }
  .status.problem {
    color: var(--danger);
  }
</style>
