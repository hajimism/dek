import { defineHandler } from "void";
import type { TalkPage } from "../../../../../../src/pub/protocol.ts";
import { notFound } from "../../../../src/common/api-error.ts";
import { api } from "../../../../src/common/http.server.ts";
import { talkPageOf } from "../../../../src/model/person/feature/profile/load.server.ts";
import { profilePage } from "../../../../src/model/person/feature/profile/paging.ts";
import { isHandle } from "../../../../src/model/person/handle.ts";
import { personByHandle } from "../../../../src/model/person/store.server.ts";

/** A page of a person's talks, for the profile's "Show more": `?page=`, from 1. */
export const GET = defineHandler((c) =>
  api(async (): Promise<TalkPage> => {
    const handle = (c.req.param("handle") ?? "").toLowerCase();
    const person = isHandle(handle) ? await personByHandle(c, handle) : null;
    const page = person ? await talkPageOf(c, person, profilePage(c.req.query("page"))) : null;
    if (!page) {
      throw notFound("talks");
    }
    return { talks: page.talks, total: page.total };
  }, c.req.raw),
);
