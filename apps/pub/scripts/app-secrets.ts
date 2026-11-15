import { z } from "zod";

/**
 * What fnox may never put on the app's Worker: the switches production keeps unset (ADR 85), and
 * the Better Auth secret `void deploy` made, which a new value would replace and sign everyone out.
 */
const NEVER_SENT = ["DEK_PUB_DEV_LOGIN", "DEK_PUB_OPEN_SIGN_UP", "BETTER_AUTH_SECRET"];

const Exported = z.object({ secrets: z.record(z.string(), z.string()).optional() });

/**
 * The secrets to put on the app's Worker, from the output of `fnox export --format json`: every
 * one the profile holds, with its value exactly as fnox resolved it (ADR 86).
 */
export function appSecrets(exportedJson: string): [string, string][] {
  const secrets = Object.entries(Exported.parse(JSON.parse(exportedJson)).secrets ?? {});
  if (secrets.length === 0) {
    throw new Error("fnox exported no secrets");
  }
  const refused = secrets.map(([name]) => name).filter((name) => NEVER_SENT.includes(name));
  if (refused.length > 0) {
    throw new Error(
      `fnox.toml holds ${refused.join(", ")}, which production never gets; remove it`,
    );
  }
  return secrets;
}
