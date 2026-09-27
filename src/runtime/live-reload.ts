import { formatDeckRoute, liveTokenQuery, withDeckPrefix } from "./routes.ts";

/**
 * The page's line to its deck's event stream on the dev server. A presenter page sends its
 * token, as the socket does, so the stream is cleared for the presenter's events.
 */
export function liveReloadScript(): string {
  return `(() => {
  const withDeckPrefix = ${withDeckPrefix};
  const liveTokenQuery = ${liveTokenQuery};
  const url = withDeckPrefix(location.pathname, ${JSON.stringify(formatDeckRoute({ kind: "events" }))});
  const es = new EventSource(url + liveTokenQuery(document.body.dataset.liveToken));
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
