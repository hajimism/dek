<script lang="ts" module>
  // 16px line icons drawn on a 16-unit grid with a 1.5 stroke, so they sit with Inter's weight.
  const PATHS = {
    lock: "M4.5 7V5a3.5 3.5 0 0 1 7 0v2M3.5 7h9v6.5h-9z",
    link: "M6.5 9.5a3 3 0 0 0 4.24 0l2.12-2.12a3 3 0 0 0-4.24-4.24L7.9 3.85M9.5 6.5a3 3 0 0 0-4.24 0L3.14 8.62a3 3 0 0 0 4.24 4.24l.7-.7",
    globe: "M8 1.75a6.25 6.25 0 1 0 0 12.5 6.25 6.25 0 0 0 0-12.5zM1.75 8h12.5M8 1.75c1.7 1.8 2.5 3.9 2.5 6.25S9.7 12.45 8 14.25C6.3 12.45 5.5 10.35 5.5 8S6.3 3.55 8 1.75z",
    "chevron-left": "M10 3.5 5.5 8l4.5 4.5",
    "chevron-right": "M6 3.5 10.5 8 6 12.5",
    "chevron-down": "M3.5 6 8 10.5 12.5 6",
    "arrow-down": "M8 2.5v11M3.5 9 8 13.5 12.5 9",
    "arrow-left": "M13.5 8h-11M7 3.5 2.5 8 7 12.5",
    "arrow-up": "M8 13.5v-11M3.5 7 8 2.5 12.5 7",
    "arrow-up-right": "M5 11 11 5M5.5 5H11v5.5",
    fullscreen: "M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10",
    copy: "M5.5 5.5V3a.5.5 0 0 1 .5-.5h7a.5.5 0 0 1 .5.5v7a.5.5 0 0 1-.5.5h-2.5M2.5 6h7.5v7.5H2.5z",
    check: "M3 8.5 6.5 12 13 4.5",
    message: "M2.5 3.5h11v7.5H7l-3 2.5V11H2.5z",
    heart: "M8 13.5S2 10 2 5.75A3.25 3.25 0 0 1 8 4a3.25 3.25 0 0 1 6 1.75C14 10 8 13.5 8 13.5z",
    bell: "M4 11.5V7a4 4 0 0 1 8 0v4.5l1.5 1h-11zM6.5 14.5h3",
    "bell-off": "M4 11.5V7a4 4 0 0 1 8 0v4.5l1.5 1h-11zM6.5 14.5h3M2 2l12 12",
    x: "M4 4l8 8M12 4l-8 8",
    sun: "M8 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3 3l1 1M12 12l1 1M3 13l1-1M12 4l1-1",
    moon: "M13.5 9.5A5.5 5.5 0 0 1 6.5 2.5a5.5 5.5 0 1 0 7 7z",
    monitor: "M2 3h12v8H2zM5.5 14h5M8 11v3",
    rss: "M3 3a10 10 0 0 1 10 10M3 7a6 6 0 0 1 6 6M3.5 12.5h.01",
    more: "M3.5 8h.01M8 8h.01M12.5 8h.01",
    reply: "M6.5 4 2.5 8l4 4M2.5 8H10a3.5 3.5 0 0 1 3.5 3.5V13",
    alert: "M8 5v3.5M8 11h.01M8 1.75 14.5 13.5h-13z",
    crosshair: "M8 1.5v3M8 11.5v3M1.5 8h3M11.5 8h3M8 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
    image: "M2.5 3h11v10h-11zM2.5 10.5 6 7l3.5 3.5L11 9l2.5 2.5",
    grid: "M2.5 2.5h4.5v4.5H2.5zM9 2.5h4.5v4.5H9zM2.5 9h4.5v4.5H2.5zM9 9h4.5v4.5H9z",
    timeline: "M4 2.5v11M4 4.5h.01M4 11.5h.01M7 4.5h6.5M7 11.5h6.5M7 8h4",
    plus: "M8 3v10M3 8h10",
    terminal: "M2 3h12v10H2zM4.5 6l2 2-2 2M8 10h3.5",
    "external": "M9.5 2.5h4v4M13.5 2.5 7.5 8.5M11.5 9.5v4h-9v-9h4",
    history: "M2.5 8a5.5 5.5 0 1 0 1.6-3.9M2.5 2.5v2.5H5M8 5v3l2 1.5",
    user: "M8 8a2.75 2.75 0 1 0 0-5.5A2.75 2.75 0 0 0 8 8zM2.75 14c.5-2.6 2.6-4 5.25-4s4.75 1.4 5.25 4",
    users: "M6 7.75a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5zM1.75 13.5c.4-2.2 2.1-3.5 4.25-3.5s3.85 1.3 4.25 3.5M10.75 3.4a2.25 2.25 0 0 1 0 4.2M12.25 10.4c1.1.5 1.8 1.6 2 3.1",
    signout: "M6 2.5H3v11h3M10 5l3 3-3 3M13 8H6",
  } as const;

  export type IconName = keyof typeof PATHS | "github" | "spinner";
</script>

<script lang="ts">
  let { name, size = 16, label }: { name: IconName; size?: number; label?: string } = $props();
</script>

{#if name === "github"}
  <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : "true"}>
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
  </svg>
{:else if name === "spinner"}
  <svg class="spin" width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-opacity="0.25" stroke-width="1.75" />
    <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" />
  </svg>
{:else}
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : "true"}>
    <path d={PATHS[name]} />
  </svg>
{/if}

<style>
  svg {
    flex-shrink: 0;
    display: block;
  }
  .spin {
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
