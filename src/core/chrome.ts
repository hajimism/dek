export function playerChromeCss(
  options: { presenter?: boolean; width?: number; height?: number } = {},
): string {
  const width = options.width ?? 1280;
  const height = options.height ?? 720;
  const base = `html, body { margin: 0; height: 100%; background: #000; color: #fff; }
#deck { position: relative; width: ${width}px; height: ${height}px; margin: 0 auto; transform-origin: top center; }
#deck > .slide:not(.is-current) { display: none; }
.dek-diagnostics { position: fixed; left: 0; right: 0; bottom: 0; padding: 8px 12px; background: #900; color: #fff; font: 12px/1.4 monospace; white-space: pre-wrap; z-index: 10; }
body[data-mode="video"] .dek-diagnostics { display: none !important; }`;
  if (options.presenter === false) {
    return base;
  }
  return `${base}
body[data-mode="video"] #dek-presenter { display: none !important; }
#dek-presenter { position: fixed; right: 0; top: 0; bottom: 0; width: 28rem; padding: 1rem; background: #1a1a1a; overflow: auto; box-sizing: border-box; }
#dek-presenter[hidden] { display: none; }
#dek-script { white-space: pre-wrap; font: 14px/1.5 sans-serif; }
.is-current-beat { background: #444; }`;
}
