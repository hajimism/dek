// What dek.pub needs from Cloudflare beyond its Workers: the two zones, their settings, and the DNS
// records no deploy command writes (ADR 70). `void deploy` keeps the app's Worker, D1, R2 and the
// mail domain's records; `wrangler deploy` keeps the serve Worker and its route. Nothing here
// declares what either of them writes, so no two tools rewrite the same record.
//
// A zone is taken over once its domain is registered, by hand, and is never deleted with the
// stack. State lives in the account (`Cloudflare.state()`), made once with `alchemy state
// bootstrap`.

import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Alchemy from "alchemy";
import { adopt } from "alchemy/AdoptPolicy";
import * as Effect from "effect/Effect";
import { type SiteZone, siteFor } from "./site.ts";

/** A zone, held to HTTPS and TLS 1.2, saying it sends no mail of its own. */
const zone = (id: string, site: SiteZone) =>
  Effect.gen(function* () {
    const { zoneId } = yield* Cloudflare.Zone.Zone(id, { name: site.name }).pipe(adopt(true));
    yield* Cloudflare.Zone.Setting(`${id}AlwaysUseHttps`, {
      zoneId,
      settingId: "always_use_https",
      value: "on",
    });
    yield* Cloudflare.Zone.Setting(`${id}MinTls`, {
      zoneId,
      settingId: "min_tls_version",
      value: "1.2",
    });
    yield* Cloudflare.DNS.Record(`${id}Spf`, {
      zoneId,
      name: "@",
      type: "TXT",
      content: site.spf,
    });
    yield* Cloudflare.DNS.Record(`${id}Dmarc`, {
      zoneId,
      name: "_dmarc",
      type: "TXT",
      content: site.dmarc,
    });
    return zoneId;
  });

export default Alchemy.Stack(
  "dek-pub",
  { providers: Cloudflare.providers(), state: Cloudflare.state() },
  Effect.gen(function* () {
    const site = siteFor(yield* Alchemy.Stage);
    const [app, decks] = site.zones;
    if (!app || !decks) {
      return yield* Effect.die(new Error("a site names the app's zone, then the decks' zone"));
    }
    yield* zone("App", app);
    const decksZone = yield* zone("Decks", decks);
    // The serve Worker's route matches only hosts whose requests reach Cloudflare's proxy, so
    // every deck host resolves to a proxied record that points nowhere else (100:: discards).
    yield* Cloudflare.DNS.Record("DeckHosts", {
      zoneId: decksZone,
      name: `*.${site.decks}`,
      type: "AAAA",
      content: "100::",
      proxied: true,
      comment: "d-<id> hosts, answered by the serve Worker's route",
    });
    return { app: site.app, decks: site.decks };
  }),
);
