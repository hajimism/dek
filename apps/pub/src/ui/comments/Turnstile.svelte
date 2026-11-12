<script lang="ts" module>
  type TurnstileApi = {
    render: (el: HTMLElement, options: Record<string, unknown>) => string;
    reset: (id: string) => void;
    remove: (id: string) => void;
  };

  let loading: Promise<TurnstileApi> | null = null;

  function load(): Promise<TurnstileApi> {
    loading ??= new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.onload = () => {
        const api = (window as unknown as { turnstile?: TurnstileApi }).turnstile;
        if (api) {
          resolve(api);
        } else {
          reject(new Error("Turnstile did not load"));
        }
      };
      script.onerror = () => {
        loading = null;
        reject(new Error("Turnstile did not load"));
      };
      document.head.appendChild(script);
    });
    return loading;
  }
</script>

<script lang="ts">
  // Cloudflare's human check, for a guest's comment; the token it gives goes with the comment.
  let { siteKey, token = $bindable(""), resetKey = 0 }: { siteKey: string; token?: string; resetKey?: number } = $props();
  let box: HTMLDivElement | undefined = $state();
  let api: TurnstileApi | null = null;
  let widget: string | null = null;

  $effect(() => {
    if (!box) {
      return;
    }
    let gone = false;
    load()
      .then((loaded) => {
        if (gone || !box) {
          return;
        }
        api = loaded;
        widget = loaded.render(box, {
          sitekey: siteKey,
          size: "flexible",
          appearance: "interaction-only",
          callback: (value: string) => (token = value),
          "expired-callback": () => (token = ""),
        });
      })
      .catch(() => {});
    return () => {
      gone = true;
      if (api && widget) {
        api.remove(widget);
      }
    };
  });

  $effect(() => {
    if (resetKey > 0 && api && widget) {
      token = "";
      api.reset(widget);
    }
  });
</script>

<div class="turnstile" bind:this={box}></div>

<style>
  .turnstile:empty {
    display: none;
  }
</style>
