export function playerChromeCss(
  options: { presenter?: boolean; width?: number; height?: number } = {},
): string {
  const width = options.width ?? 1280;
  const height = options.height ?? 720;
  const base = `html, body { margin: 0; height: 100%; background: #000; color: #fff; }
#dek-shell { height: 100%; display: grid; grid-template-columns: minmax(0, 1fr); grid-template-areas: "current"; }
body:not(.is-presenter):not(.is-rail-hidden) #dek-shell:has(> #dek-rail) { grid-template-columns: var(--dek-rail-w, 188px) minmax(0, 1fr); grid-template-areas: "rail current"; }
#dek-current { grid-area: current; height: 100%; display: flex; flex-direction: column; min-height: 0; }
#dek-current-stage { flex: 1; min-height: 0; position: relative; overflow: hidden; }
#dek-current-stage #deck { position: absolute; top: 0; left: 0; margin: 0; transform-origin: top left; }
#deck { position: relative; width: ${width}px; height: ${height}px; margin: 0 auto; transform-origin: top center; }
#deck > .slide:not(.is-current) { display: none; }
#dek-rail { grid-area: rail; min-height: 0; background: #141414; border-right: 1px solid rgba(255,255,255,0.08); overflow: auto; padding: 12px 10px; display: flex; flex-direction: column; gap: 12px; box-sizing: border-box; scrollbar-width: thin; }
.dek-thumb { display: flex; align-items: flex-start; gap: 8px; color: inherit; text-decoration: none; outline: none; }
.dek-thumb-num { width: 16px; flex: none; font: 500 11px/1.2 system-ui, sans-serif; text-align: right; color: rgba(255,255,255,0.55); padding-top: 2px; font-variant-numeric: tabular-nums; }
.dek-thumb-frame { position: relative; flex: 1; min-width: 0; aspect-ratio: ${width}/${height}; background: #111; border-radius: 4px; outline: 2px solid transparent; overflow: hidden; }
.dek-thumb-stage { position: absolute; top: 0; left: 0; transform-origin: top left; pointer-events: none; }
.dek-thumb-stage > .slide { width: 100%; height: 100%; }
#dek-rail .slide [data-step] { opacity: 1 !important; transform: none !important; transition: none !important; }
.dek-thumb.is-current .dek-thumb-num { color: #fff; }
.dek-thumb.is-current .dek-thumb-frame { outline-color: #3ab9d5; }
.dek-thumb:hover .dek-thumb-frame, .dek-thumb:focus-visible .dek-thumb-frame { outline-color: rgba(255,255,255,0.25); }
.dek-thumb.is-current:hover .dek-thumb-frame, .dek-thumb.is-current:focus-visible .dek-thumb-frame { outline-color: #3ab9d5; }
#dek-rail-resize { position: fixed; left: calc(var(--dek-rail-w, 188px) - 3px); top: 0; bottom: 0; width: 6px; cursor: col-resize; z-index: 5; touch-action: none; }
#dek-rail-resize:hover, #dek-rail-resize[data-dragging] { background: rgba(255,255,255,0.12); }
body.is-rail-hidden #dek-rail, body.is-rail-hidden #dek-rail-resize, body[data-mode="video"] #dek-rail, body[data-mode="video"] #dek-rail-resize { display: none; }
@media (max-width: 640px) {
  body:not(.is-presenter):not(.is-rail-hidden) #dek-shell:has(> #dek-rail) { grid-template-columns: minmax(0, 1fr); grid-template-areas: "current"; }
  #dek-rail, #dek-rail-resize { display: none; }
}
.dek-panel-label { display: none; }
.dek-diagnostics { position: fixed; left: 0; right: 0; bottom: 0; padding: 8px 12px; background: #900; color: #fff; font: 12px/1.4 monospace; white-space: pre-wrap; z-index: 10; }
body[data-mode="video"] .dek-diagnostics { display: none !important; }`;
  if (options.presenter === false) {
    return base;
  }
  return `${base}
body[data-mode="video"] #dek-presenter, body[data-mode="video"] #dek-progress { display: none !important; }
#dek-presenter[hidden], #dek-progress[hidden], #dek-next-end[hidden] { display: none; }
body.is-presenter { background: #121212; color: #ddd; font-family: system-ui, sans-serif; display: flex; flex-direction: column; }
body.is-presenter .dek-panel-label { display: block; font: 12px/1.4 system-ui, sans-serif; opacity: 0.5; padding: 4px 8px; }
body.is-presenter #dek-progress:not([hidden]) { display: flex; height: 4px; flex: none; background: #121212; gap: 1px; }
#dek-progress > span { flex: 1; background: rgba(255,255,255,0.12); position: relative; }
#dek-progress > span.is-done { background: #3ab9d5; }
#dek-progress > span.is-current::after { content: ""; position: absolute; inset: 0 auto 0 0; width: var(--dek-fill, 0%); background: #3ab9d5; }
body.is-presenter #dek-rail, body.is-presenter #dek-rail-resize { display: none; }
body.is-presenter #dek-shell { flex: 1; min-height: 0; height: auto; display: grid; grid-template-columns: minmax(0, 1fr) minmax(16rem, 26%); grid-template-rows: minmax(0, 1.15fr) minmax(0, 1fr) auto; grid-template-areas: "current next" "current notes" "bar bar"; gap: 1px; background: rgba(255,255,255,0.12); }
body.is-presenter #dek-current { grid-area: current; height: auto; background: #121212; }
body.is-presenter #dek-current-stage { padding: 8px 16px 16px; box-sizing: border-box; }
body.is-presenter #dek-presenter:not([hidden]) { display: contents; }
#dek-next-panel { grid-area: next; display: flex; flex-direction: column; min-width: 0; min-height: 0; background: #121212; }
.dek-next-body { flex: 1; min-height: 0; position: relative; }
#dek-next-stage { height: 100%; position: relative; overflow: hidden; }
.dek-preview-frame { position: absolute; top: 0; left: 0; transform-origin: top left; }
.dek-preview-frame > .slide { width: 100%; height: 100%; }
#dek-next-end { margin: 0; position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; opacity: 0.5; font: 14px/1.4 system-ui, sans-serif; pointer-events: none; }
#dek-next { margin: 0; padding: 4px 8px; font: 12px/1.4 system-ui, sans-serif; opacity: 0.7; }
#dek-next:empty { display: none; }
#dek-notes-panel { grid-area: notes; display: flex; flex-direction: column; min-width: 0; min-height: 0; background: #121212; overflow: hidden; }
#dek-beats { margin: 0; padding: 8px 12px; list-style: none; font: 13px/1.4 system-ui, sans-serif; border-bottom: 1px solid rgba(255,255,255,0.12); overflow: auto; max-height: 40%; }
#dek-beats li { padding: 2px 6px; border-radius: 2px; }
.is-current-beat { background: rgba(255,255,255,0.12); }
#dek-script { flex: 1; margin: 0; padding: 12px; overflow: auto; white-space: pre-wrap; font: 14px/1.5 system-ui, sans-serif; }
#dek-presenter-bar { grid-area: bar; display: flex; align-items: baseline; gap: 12px; padding: 8px 12px; background: #121212; font: 14px/1.4 system-ui, sans-serif; }
#dek-page { opacity: 0.85; }
#dek-page .dek-page-total { opacity: 0.5; font-size: 0.85em; }
#dek-elapsed { margin: 0 0 0 auto; font: 1.5rem/1 ui-monospace, SFMono-Regular, Menlo, monospace; }
#dek-elapsed.is-warn { color: #eab308; }
#dek-elapsed.is-over { color: #ef4444; }
#dek-budget { margin: 0; opacity: 0.5; font: 0.85rem/1 ui-monospace, SFMono-Regular, Menlo, monospace; }
#dek-budget:empty { display: none; }
@media (max-aspect-ratio: 1/1) {
  body.is-presenter #dek-shell { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1.4fr) minmax(7rem, 0.55fr) minmax(0, 1fr) auto; grid-template-areas: "current" "next" "notes" "bar"; }
}`;
}
