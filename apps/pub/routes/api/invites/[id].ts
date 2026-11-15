import { defineHandler } from "void";
import { api } from "../../../src/common/http.server.ts";
import { removeInvite } from "../../../src/model/person/feature/settings/invites.server.ts";

/** Remove an entry no account was made from, answering the list as it stands after. */
export const DELETE = defineHandler((c) =>
  api(() => removeInvite(c, c.req.param("id") ?? ""), c.req.raw),
);
