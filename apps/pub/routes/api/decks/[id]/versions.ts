import { defineHandler } from "void";
import { api } from "../../../../src/common/http.server.ts";
import { publish } from "../../../../src/model/deck/feature/publish/publish.server.ts";
import { ownedDeck } from "../../../../src/model/deck/store.server.ts";
import { versionsOf } from "../../../../src/model/deck/version/store.server.ts";
import { summaryOf } from "../../../../src/model/deck/version/version.ts";
import { requirePerson } from "../../../../src/model/person/actor.server.ts";

export const GET = defineHandler((c) =>
  api(async () => {
    const deck = await ownedDeck(c.req.param("id") ?? "", await requirePerson(c));
    return { versions: (await versionsOf(deck.id)).map(summaryOf) };
  }, c.req.raw),
);

export const POST = defineHandler((c) =>
  api(async () => {
    const deck = await ownedDeck(c.req.param("id") ?? "", await requirePerson(c));
    const result = await publish(c, deck, { promote: c.req.query("promote") !== "0" });
    return Response.json(result, { status: 201 });
  }, c.req.raw),
);
