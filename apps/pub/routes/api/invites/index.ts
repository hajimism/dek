import { defineHandler } from "void";
import { api } from "../../../src/common/http.server.ts";
import {
  addInvites,
  listInvites,
} from "../../../src/model/person/feature/settings/invites.server.ts";

/** Who may sign up, as protocol SignUpInvites; an operator's browser session only, else a 404. */
export const GET = defineHandler((c) => api(() => listInvites(c), c.req.raw));

/** Add entries, protocol NewSignUpInvites, and mail each new address; the list as it stands after. */
export const POST = defineHandler((c) => api(() => addInvites(c), c.req.raw));
