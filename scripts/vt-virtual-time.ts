/**
 * Throwaway spike: does View Transition animation follow CDP virtual time?
 *
 *   bun scripts/vt-virtual-time.ts
 *
 * Interprets the result for src/video/strategy.ts. Does not bake production video.
 */
const html = `<!DOCTYPE html>
<html><head>
<style>
::view-transition-old(root), ::view-transition-new(root) { animation-duration: 0.2s; }
#a, #b { width: 200px; height: 200px; }
#a { background: #c00; view-transition-name: box; }
#b { background: #0c0; view-transition-name: box; display: none; }
#b.show { display: block; }
#a.hide { display: none; }
</style>
</head>
<body>
<div id="a"></div><div id="b"></div>
<script>
window.runVt = () => document.startViewTransition(() => {
  document.getElementById("a").classList.add("hide");
  document.getElementById("b").classList.add("show");
});
</script>
</body></html>`;

async function main(): Promise<void> {
  let playwright: typeof import("playwright");
  try {
    playwright = require("playwright") as typeof import("playwright");
  } catch {
    console.log("playwright missing; keeping VIDEO_CAPTURE_STRATEGY=animation-wall-clock");
    return;
  }
  const browser = await playwright.chromium.launch();
  const page = await browser.newPage();
  const session = await page.context().newCDPSession(page);
  await page.setContent(html);
  await session.send("Emulation.setVirtualTimePolicy", {
    policy: "pause",
    initialVirtualTime: 0,
  });
  const started = Date.now();
  await page.evaluate("window.runVt()");
  await session.send("Emulation.setVirtualTimePolicy", {
    policy: "pauseIfNetworkFetchesComplete",
    budget: 500,
  });
  const elapsed = Date.now() - started;
  const vtFollows = elapsed < 80;
  console.log(
    JSON.stringify({
      wallMs: elapsed,
      vtFollowsVirtualTime: vtFollows,
      strategy: vtFollows ? "virtual-time" : "animation-wall-clock",
    }),
  );
  await browser.close();
}

await main();
