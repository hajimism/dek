export function playerChromeCss(
  options: { presenter?: boolean; width?: number; height?: number } = {},
): string {
  const width = options.width ?? 1280;
  const height = options.height ?? 720;
  const base = `html, body { margin: 0; height: 100%; background: #000; color: #fff; }
#dekc-shell { height: 100%; display: grid; grid-template-columns: minmax(0, 1fr); grid-template-areas: "current"; }
body:not(.is-presenter):not(.is-rail-hidden) #dekc-shell:has(> #dekc-rail) { grid-template-columns: var(--dekc-rail-w, 188px) minmax(0, 1fr); grid-template-areas: "rail current"; }
#dekc-current { grid-area: current; height: 100%; display: flex; flex-direction: column; min-height: 0; }
#dekc-current-stage { flex: 1; min-height: 0; position: relative; overflow: hidden; touch-action: pan-y pinch-zoom; }
#dekc-current-stage #deck { position: absolute; top: 0; left: 0; margin: 0; transform-origin: top left; }
#deck { position: relative; width: ${width}px; height: ${height}px; margin: 0 auto; transform-origin: top center; }
@media not print { #deck > .slide:not(.is-current) { display: none; } }
#deck { view-transition-name: slide; }
::view-transition-group(slide) { overflow: clip; }
::view-transition-old(root), ::view-transition-new(root) { animation: none; }
#dekc-rail { grid-area: rail; min-height: 0; background: #141414; border-right: 1px solid rgba(255,255,255,0.08); overflow: auto; padding: 12px 10px; display: flex; flex-direction: column; gap: 12px; box-sizing: border-box; scrollbar-width: thin; }
.dekc-thumb { display: flex; align-items: flex-start; gap: 8px; color: inherit; text-decoration: none; outline: none; }
.dekc-thumb-num { width: 16px; flex: none; font: 500 11px/1.2 system-ui, sans-serif; text-align: right; color: rgba(255,255,255,0.55); padding-top: 2px; font-variant-numeric: tabular-nums; }
.dekc-thumb-frame { position: relative; flex: 1; min-width: 0; aspect-ratio: ${width}/${height}; background: #111; border-radius: 4px; outline: 2px solid transparent; overflow: hidden; }
.dekc-thumb-stage { position: absolute; top: 0; left: 0; transform-origin: top left; pointer-events: none; }
.dekc-thumb-stage > .slide { width: 100%; height: 100%; }
#dekc-rail .slide [data-step] { opacity: 1 !important; transform: none !important; transition: none !important; }
.dekc-thumb.is-current .dekc-thumb-num { color: #fff; }
.dekc-thumb.is-current .dekc-thumb-frame { outline-color: #3ab9d5; }
.dekc-thumb:hover .dekc-thumb-frame, .dekc-thumb:focus-visible .dekc-thumb-frame { outline-color: rgba(255,255,255,0.25); }
.dekc-thumb.is-current:hover .dekc-thumb-frame, .dekc-thumb.is-current:focus-visible .dekc-thumb-frame { outline-color: #3ab9d5; }
#dekc-rail-resize { position: fixed; left: calc(var(--dekc-rail-w, 188px) - 3px); top: 0; bottom: 0; width: 6px; cursor: col-resize; z-index: 5; touch-action: none; }
#dekc-rail-resize:hover, #dekc-rail-resize[data-dragging] { background: rgba(255,255,255,0.12); }
body.is-rail-hidden #dekc-rail, body.is-rail-hidden #dekc-rail-resize, body[data-mode="video"] #dekc-rail, body[data-mode="video"] #dekc-rail-resize { display: none; }
@media (max-width: 640px) {
  body:not(.is-presenter):not(.is-rail-hidden) #dekc-shell:has(> #dekc-rail) { grid-template-columns: minmax(0, 1fr); grid-template-areas: "current"; }
  #dekc-rail, #dekc-rail-resize { display: none; }
  body:not(.is-rail-hidden):has(> #dekc-shell > #dekc-rail) #dekc-hint { left: 50%; }
}
.dekc-panel-label { display: none; }
#dekc-announce { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
#dekc-hint { position: fixed; left: 50%; bottom: 28px; z-index: 20; display: flex; gap: 18px; padding: 10px 18px; background: rgba(18,18,18,0.86); color: #fff; border: 1px solid rgba(255,255,255,0.14); border-radius: 999px; box-shadow: 0 8px 28px rgba(0,0,0,0.35); font: 500 13px/1.4 system-ui, sans-serif; white-space: nowrap; pointer-events: none; opacity: 0; transform: translate(-50%, 12px); animation: dekc-hint 5s cubic-bezier(0.22, 1, 0.36, 1) 0.5s forwards; }
body:not(.is-rail-hidden):has(> #dekc-shell > #dekc-rail) #dekc-hint { left: calc(50% + var(--dekc-rail-w, 188px) / 2); }
#dekc-hint > span { display: inline-flex; align-items: center; gap: 8px; }
#dekc-hint kbd { min-width: 1.6em; padding: 1px 6px; box-sizing: border-box; border: 1px solid rgba(255,255,255,0.35); border-bottom-width: 2px; border-radius: 5px; font: 600 12px/1.4 ui-monospace, monospace; text-align: center; }
@keyframes dekc-hint { 12% { opacity: 1; transform: translate(-50%, 0); } 80% { opacity: 1; transform: translate(-50%, 0); } 100% { opacity: 0; transform: translate(-50%, 0); } }
@media (prefers-reduced-motion: reduce) { #dekc-hint { transform: translate(-50%, 0); animation-name: dekc-hint-fade; } @keyframes dekc-hint-fade { 12%, 80% { opacity: 1; } } }
@media (pointer: coarse) { #dekc-hint { display: none; } }
#dekc-laser { position: absolute; z-index: 30; width: 24px; height: 24px; margin: -12px 0 0 -12px; border-radius: 50%; background: radial-gradient(circle, #fff 0 12%, #ff3b30 22% 38%, rgba(255,59,48,0.45) 52%, rgba(255,59,48,0) 70%); pointer-events: none; }
#dekc-laser[hidden] { display: none; }
body.is-laser #dekc-current-stage { cursor: crosshair; touch-action: none; }
.dekc-diagnostics { position: fixed; left: 0; right: 0; bottom: 0; padding: 8px 12px; background: #900; color: #fff; font: 12px/1.4 monospace; white-space: pre-wrap; z-index: 10; }
body[data-mode="video"] .dekc-diagnostics { display: none !important; }
@media print {
${indent(printPageCss({ width, height }))}
  body, #dekc-shell, #dekc-current, #dekc-current-stage { display: block; height: auto; overflow: visible; position: static; padding: 0; }
  #deck [data-step] { opacity: 1 !important; transform: none !important; transition: none !important; }
  #dekc-rail, #dekc-rail-resize, #dekc-hint, #dekc-laser, .dekc-panel-label, .dekc-diagnostics { display: none !important; }
}`;
  if (options.presenter === false) {
    return base;
  }
  return `${base}
@media print { #dekc-presenter, #dekc-progress { display: none !important; } }
body[data-mode="video"] #dekc-presenter, body[data-mode="video"] #dekc-progress { display: none !important; }
#dekc-presenter[hidden], #dekc-progress[hidden], #dekc-next-end[hidden] { display: none; }
#dekc-mark-toggle { flex: none; width: 2.25rem; height: 2.25rem; padding: 0; border: 1px solid rgba(255,255,255,0.2); border-radius: 50%; background: transparent; color: rgba(255,255,255,0.45); cursor: pointer; font: 600 1rem/1 system-ui, sans-serif; }
#dekc-mark-toggle::before { content: "✎"; }
#dekc-mark-toggle[aria-pressed="true"] { border-color: #eab308; color: #eab308; }
#dekc-mark-toggle[data-error] { border-color: #ef4444; }
#dekc-beats li.is-marked::after { content: " ✎"; color: #eab308; }
#dekc-laser-toggle { flex: none; width: 2.25rem; height: 2.25rem; padding: 0; border: 1px solid rgba(255,255,255,0.2); border-radius: 50%; background: transparent; cursor: pointer; }
#dekc-laser-toggle::before { content: ""; display: block; width: 10px; height: 10px; margin: auto; border-radius: 50%; background: rgba(255,255,255,0.45); }
#dekc-laser-toggle[aria-pressed="true"] { border-color: #ff3b30; }
#dekc-laser-toggle[aria-pressed="true"]::before { background: #ff3b30; box-shadow: 0 0 8px #ff3b30; }
body.is-presenter { background: #121212; color: #ddd; font-family: system-ui, sans-serif; display: flex; flex-direction: column; }
body.is-presenter .dekc-panel-label { display: block; font: 12px/1.4 system-ui, sans-serif; opacity: 0.65; padding: 4px 8px; }
body.is-presenter #dekc-progress:not([hidden]) { display: flex; height: 4px; flex: none; background: #121212; gap: 1px; }
#dekc-progress > span { flex: 1; background: rgba(255,255,255,0.12); position: relative; }
#dekc-progress > span.is-done { background: #3ab9d5; }
#dekc-progress > span.is-current::after { content: ""; position: absolute; inset: 0 auto 0 0; width: var(--dekc-fill, 0%); background: #3ab9d5; }
body.is-presenter #dekc-rail, body.is-presenter #dekc-rail-resize { display: none; }
body.is-presenter #dekc-shell { flex: 1; min-height: 0; height: auto; display: grid; grid-template-columns: minmax(0, 1fr) minmax(16rem, 26%); grid-template-rows: minmax(0, 1.15fr) minmax(0, 1fr) auto; grid-template-areas: "current next" "current notes" "bar bar"; gap: 1px; background: rgba(255,255,255,0.12); }
body.is-presenter #dekc-current { grid-area: current; height: auto; background: #121212; }
body.is-presenter #dekc-current-stage { padding: 8px 16px 16px; box-sizing: border-box; }
body.is-presenter #dekc-presenter:not([hidden]) { display: contents; }
#dekc-next-panel { grid-area: next; display: flex; flex-direction: column; min-width: 0; min-height: 0; background: #121212; }
.dekc-next-body { flex: 1; min-height: 0; position: relative; }
#dekc-next-stage { height: 100%; position: relative; overflow: hidden; }
.dekc-preview-frame { position: absolute; top: 0; left: 0; transform-origin: top left; }
.dekc-preview-frame > .slide { width: 100%; height: 100%; }
#dekc-next-end { margin: 0; position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; opacity: 0.5; font: 14px/1.4 system-ui, sans-serif; pointer-events: none; }
#dekc-next { margin: 0; padding: 4px 8px; font: 12px/1.4 system-ui, sans-serif; opacity: 0.7; }
#dekc-next:empty { display: none; }
#dekc-notes-panel { grid-area: notes; display: flex; flex-direction: column; min-width: 0; min-height: 0; background: #121212; overflow: hidden; }
#dekc-beats { margin: 0; padding: 8px 12px; list-style: none; font: 13px/1.4 system-ui, sans-serif; border-bottom: 1px solid rgba(255,255,255,0.12); overflow: auto; max-height: 40%; }
#dekc-beats li { padding: 2px 6px; border-radius: 2px; }
.is-current-beat { background: rgba(255,255,255,0.12); }
#dekc-script { flex: 1; margin: 0; padding: 12px; overflow: auto; white-space: pre-wrap; font: 14px/1.5 system-ui, sans-serif; }
#dekc-presenter-bar { grid-area: bar; display: flex; align-items: baseline; gap: 12px; padding: 8px 12px; background: #121212; font: 14px/1.4 system-ui, sans-serif; }
#dekc-page { opacity: 0.85; }
#dekc-page .dekc-page-total { opacity: 0.5; font-size: 0.85em; }
#dekc-elapsed { margin: 0 0 0 auto; font: 1.5rem/1 ui-monospace, SFMono-Regular, Menlo, monospace; }
#dekc-elapsed.is-warn { color: #eab308; }
#dekc-elapsed.is-over { color: #ef4444; }
#dekc-budget { margin: 0; opacity: 0.5; font: 0.85rem/1 ui-monospace, SFMono-Regular, Menlo, monospace; }
#dekc-budget:empty { display: none; }
@media (max-aspect-ratio: 1/1) {
  body.is-presenter #dekc-shell { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1.4fr) minmax(7rem, 0.55fr) minmax(0, 1fr) auto; grid-template-areas: "current" "next" "notes" "bar"; }
}`;
}

/**
 * One slide per page at the deck's logical size. A slide's display is its layout, which the
 * theme owns, so neither this nor the player's chrome ever sets it: the player hides the
 * slides it is not showing on screen only. `dekc pdf` prints with it, and the player wraps
 * it in `@media print` so the browser's own Print gives the same pages.
 */
export function printPageCss(size: { width: number; height: number }): string {
  return `@page { size: ${size.width}px ${size.height}px; margin: 0 }
html, body { margin: 0; padding: 0; background: #000; }
#deck { position: static; width: ${size.width}px; height: auto; margin: 0; transform: none !important; }
#deck > .slide { width: ${size.width}px; height: ${size.height}px; break-inside: avoid; }
#deck > .slide:not(:last-child) { break-after: page; }`;
}

function indent(css: string): string {
  return css
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n");
}
