// The CLI's API key. `dekc pub login` ends the device flow with a session token and trades it
// here for a key that lasts; `dekc pub logout` revokes the key it holds.

import { defineHandler } from "void";
import { API_KEY_HEADER, type CliKey } from "../../../../../src/pub/protocol.ts";
import { requirePerson } from "../../../src/server/actor.ts";
import { ApiError, api } from "../../../src/server/http.ts";
import { authOf } from "../../../src/server/void-auth.ts";

export const POST = defineHandler((c) =>
  api(async () => {
    if (!c.get("user")) {
      throw new ApiError(401, "signed_out", "trade a device-flow session for a key", "run `dekc pub login`");
    }
    const person = await requirePerson(c);
    const agent = c.req.header("user-agent") ?? "dekc";
    const created = (await authOf(c).api.createApiKey({
      body: { userId: person.id, name: `dekc (${agent.slice(0, 60)})` },
    })) as { key: string };
    const body: CliKey = { key: created.key, me: { id: person.id, handle: person.handle, name: person.name } };
    return body;
  }),
);

export const DELETE = defineHandler((c) =>
  api(async () => {
    const key = c.req.header(API_KEY_HEADER);
    if (!key) {
      throw new ApiError(401, "signed_out", "send the key to revoke");
    }
    const auth = authOf(c);
    const result = (await auth.api.verifyApiKey({ body: { key } })) as { valid: boolean; key?: { id: string } | null };
    if (result.valid && result.key) {
      const context = await auth.$context;
      await context.adapter.delete({ model: "apikey", where: [{ field: "id", value: result.key.id }] });
    }
    return { revoked: result.valid };
  }),
);
