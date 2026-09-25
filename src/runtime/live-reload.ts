import { liveTokenQuery } from "./routes.ts";

/**
 * The page's line to the dev server's event stream. A presenter page sends its token, as the
 * socket does, so the stream is cleared for the presenter's events from any page path.
 */
export function liveReloadScript(): string {
  return `(() => {
  const es = new EventSource("/events" + (${liveTokenQuery})(document.body.dataset.liveToken));
  es.onmessage = async (message) => {
    let event;
    try {
      event = JSON.parse(message.data);
    } catch {
      location.reload();
      return;
    }
    const live = window["dekLive"];
    if (typeof live === "function") {
      await live(event);
      return;
    }
    location.reload();
  };
})();`;
}
