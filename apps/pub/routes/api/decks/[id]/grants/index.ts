import { defineHandler } from "void";
import { NewGrant } from "../../../../../../../src/pub/protocol.ts";
import { ApiError } from "../../../../../src/common/api-error.ts";
import { afterAnswer, api, appUrl, jsonBody } from "../../../../../src/common/http.server.ts";
import { sendMail } from "../../../../../src/common/mail.server.ts";
import { granteeOf } from "../../../../../src/model/deck/grant/grant.ts";
import { invitationMail } from "../../../../../src/model/deck/grant/invite.ts";
import { grantList, share } from "../../../../../src/model/deck/grant/store.server.ts";
import { ownedDeck, talkUrl } from "../../../../../src/model/deck/store.server.ts";
import { requirePerson } from "../../../../../src/model/person/actor.server.ts";

export const GET = defineHandler((c) =>
  api(async () => {
    const deck = await ownedDeck(c.req.param("id") ?? "", await requirePerson(c));
    return { grants: await grantList(c, deck.id) };
  }, c.req.raw),
);

/**
 * Share the deck with one person, by handle, or by an email address no account has yet, on the
 * team's side or the guests'. A new share is mailed to them; a change to one is not, and keeps
 * the role and side the request leaves out.
 */
export const POST = defineHandler((c) =>
  api(async () => {
    const owner = await requirePerson(c);
    const deck = await ownedDeck(c.req.param("id") ?? "", owner);
    const { who, role, side } = await jsonBody(c, NewGrant);
    const grantee = granteeOf(who);
    if (!grantee) {
      throw new ApiError(422, "invalid", "name a handle or an email address");
    }
    const { grant, invite } = await share(c, deck, grantee, role, side);
    if (invite) {
      const talk = await talkUrl(c, deck);
      const url = invite.byEmail
        ? appUrl(`/signin?next=${encodeURIComponent(new URL(talk).pathname)}`)
        : talk;
      afterAnswer(
        c,
        sendMail(
          invitationMail({
            ...invite,
            inviter: owner.name || owner.handle,
            title: deck.title,
            role: grant.role,
            url,
          }),
        ),
      );
    }
    return Response.json(grant, { status: 201 });
  }, c.req.raw),
);
