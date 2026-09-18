export function liveReloadScript(): string {
  return `(() => {
  const es = new EventSource("/events");
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
