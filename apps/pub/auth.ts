// dek.pub's Better Auth setup, on top of Void's defaults. On the deployed app one signs in with
// GitHub, or by a link mailed to an address that has an account or a share waiting for it; email
// sign-up with a password exists only where DEK_PUB_DEV_LOGIN is 1, for local runs and tests.
// The device flow lets `dekc pub login` sign in, and the CLI then holds an API key.

import { apiKey } from "@better-auth/api-key";
import { bearer, deviceAuthorization, magicLink } from "better-auth/plugins";
import { defineAuth } from "void/auth";
import { CLI_CLIENT_ID } from "../../src/pub/protocol.ts";
import { log } from "./src/common/log.ts";
import { API_KEY_PREFIX } from "./src/model/person/api-key.ts";
import { claimOnSignIn } from "./src/model/person/feature/sign-in/claim.server.ts";
import { sendSignInLink } from "./src/model/person/feature/sign-in/link.server.ts";
import { SIGN_IN_LINK_SECONDS } from "./src/model/person/feature/sign-in/mail.ts";
import { handleFromEmail, normalizeHandle } from "./src/model/person/handle.ts";

// The Worker's waitUntil, which keeps it running for mail sent after the answer. Imported lazily:
// `void db generate` reads this file in Node, which has no such module.
let keepAlive: ((task: Promise<unknown>) => void) | undefined;
import("cloudflare:workers").then(
  (workers) => {
    keepAlive = workers.waitUntil;
  },
  () => undefined,
);

export default defineAuth(({ defaults, env }) => {
  const devLogin = env.DEK_PUB_DEV_LOGIN === "1";
  return {
    ...defaults,
    emailAndPassword: { enabled: devLogin },
    // Better Auth logs the errors its queries throw, which carry the values they were bound to.
    logger: { log: (level, message, ...args) => log(level, `Better Auth: ${message}`, ...args) },
    // Mail goes out after the answer, so how long a request for a link takes says nothing of
    // whether the address may have one. A task that fails is logged here, not left to the
    // runtime, which would log its error whole.
    advanced: {
      ...defaults.advanced,
      backgroundTasks: {
        handler: (task) => {
          const settled = task.catch((error: unknown) =>
            log("error", "Better Auth: a background task failed", error),
          );
          keepAlive?.(settled);
        },
      },
    },
    socialProviders: {
      ...defaults.socialProviders,
      github: {
        ...defaults.socialProviders?.github,
        clientId: String(env.AUTH_GITHUB_CLIENT_ID),
        clientSecret: String(env.AUTH_GITHUB_CLIENT_SECRET),
        mapProfileToUser: (profile: { login: string }) => ({
          handle: normalizeHandle(profile.login),
        }),
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
          // An account a sign-in link makes has no name; it goes by its address's local part.
          before: async (user: { email: string; name?: string; handle?: string | null }) => ({
            data: {
              ...user,
              name: user.name || (user.email.split("@")[0] ?? user.email),
              handle: user.handle ?? handleFromEmail(user.email),
            },
          }),
        },
      },
      session: {
        create: {
          // Grants waiting on an address are claimed when its owner signs in, not when they read.
          after: async (
            session: { userId: string },
            ctx: {
              context: { internalAdapter: { findUserById(id: string): Promise<unknown> } };
            } | null,
          ) => {
            await claimOnSignIn(await ctx?.context.internalAdapter.findUserById(session.userId));
          },
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
      magicLink({
        expiresIn: SIGN_IN_LINK_SECONDS,
        sendMagicLink: ({ email, url }, ctx) => {
          ctx?.context.runInBackground(
            (async () => {
              const account = await ctx.context.internalAdapter.findUserByEmail(email);
              await sendSignInLink(email, url, account !== null);
            })(),
          );
        },
      }),
      apiKey({
        defaultPrefix: API_KEY_PREFIX,
        rateLimit: { enabled: false },
        enableMetadata: true,
      }),
    ],
  };
});
