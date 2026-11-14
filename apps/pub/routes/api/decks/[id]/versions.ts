import { defineHandler } from "void";
import { api } from "../../../../src/common/http.server.ts";
import { publish } from "../../../../src/model/deck/feature/publish/publish.server.ts";
import { ownedDeck } from "../../../../src/model/deck/store.server.ts";
import { requirePerson } from "../../../../src/model/person/actor.server.ts";

export const POST = defineHandler((c) =>
  api(async () => {
    const deck = await ownedDeck(c.req.param("id") ?? "", await requirePerson(c));
    return Response.json(await publish(c, deck), { status: 201 });
  }, c.req.raw),
);
