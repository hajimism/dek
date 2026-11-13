// dek.pub's Better Auth setup, on top of Void's defaults. GitHub is the only way in on the
// deployed app; email sign-up exists only where DEK_PUB_DEV_LOGIN is 1, for local runs and tests.
// The device flow lets `dekc pub login` sign in, and the CLI then holds an API key.

import { apiKey } from "@better-auth/api-key";
import { bearer, deviceAuthorization } from "better-auth/plugins";
import { defineAuth } from "void/auth";
import { CLI_CLIENT_ID } from "../../src/pub/protocol.ts";
import { API_KEY_PREFIX } from "./src/model/person/api-key.ts";
import { handleFromEmail, normalizeHandle } from "./src/model/person/handle.ts";

export default defineAuth(({ defaults, env }) => {
  const devLogin = env.DEK_PUB_DEV_LOGIN === "1";
  return {
    ...defaults,
    emailAndPassword: { enabled: devLogin },
    socialProviders: {
      ...defaults.socialProviders,
      github: {
        ...defaults.socialProviders?.github,
        clientId: String(env.AUTH_GITHUB_CLIENT_ID),
        clientSecret: String(env.AUTH_GITHUB_CLIENT_SECRET),
        mapProfileToUser: (profile: { login: string }) => ({ handle: normalizeHandle(profile.login) }),
      },
    },
    user: {
      additionalFields: {
        handle: { type: "string", required: false, unique: true, input: false },
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user: { email: string; handle?: string | null }) => ({
            data: { ...user, handle: user.handle ?? handleFromEmail(user.email) },
          }),
        },
      },
    },
    plugins: [
      bearer(),
      deviceAuthorization({
        verificationUri: "/device",
        expiresIn: "15m",
        interval: "5s",
        validateClient: (clientId: string) => clientId === CLI_CLIENT_ID,
      }),
      apiKey({
        defaultPrefix: API_KEY_PREFIX,
        rateLimit: { enabled: false },
        enableMetadata: true,
      }),
    ],
  };
});
