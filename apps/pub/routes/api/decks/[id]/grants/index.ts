import { defineHandler } from "void";
import { NewGrant } from "../../../../../../../src/pub/protocol.ts";
import { ApiError } from "../../../../../src/common/api-error.ts";
import { api, jsonBody } from "../../../../../src/common/http.server.ts";
import { granteeOf } from "../../../../../src/model/deck/grant/grant.ts";
import { grantList, share } from "../../../../../src/model/deck/grant/store.server.ts";
import { ownedDeck } from "../../../../../src/model/deck/store.server.ts";
import { requirePerson } from "../../../../../src/model/person/actor.server.ts";

export const GET = defineHandler((c) =>
  api(async () => {
    const deck = await ownedDeck(c.req.param("id") ?? "", await requirePerson(c));
    return { grants: await grantList(c, deck.id) };
  }, c.req.raw),
);

/**
 * Share the deck with one person, by handle, or by an email address no account has yet, on the
 * team's side or the client's.
 */
export const POST = defineHandler((c) =>
  api(async () => {
    const deck = await ownedDeck(c.req.param("id") ?? "", await requirePerson(c));
    const { who, role, side } = await jsonBody(c, NewGrant);
    const grantee = granteeOf(who);
    if (!grantee) {
      throw new ApiError(422, "invalid", "name a handle or an email address");
    }
    return Response.json(await share(c, deck, grantee, role, side), { status: 201 });
  }, c.req.raw),
);
