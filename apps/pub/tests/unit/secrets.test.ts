import { describe, expect, it } from "vitest";
import { appSecrets } from "../../scripts/app-secrets.ts";

const exported = (secrets: Record<string, string>) =>
  JSON.stringify({ secrets, metadata: { profile: "prod", total_secrets: 0 } });

describe("appSecrets", () => {
  it("hands over each secret fnox exports, byte for byte", () => {
    expect(
      appSecrets(
        exported({
          SERVE_TOKEN_SECRET: 'it\'s "x" \\n ',
          DEK_PUB_OPERATORS: "a@example.com, b@example.com",
        }),
      ),
    ).toEqual([
      ["SERVE_TOKEN_SECRET", 'it\'s "x" \\n '],
      ["DEK_PUB_OPERATORS", "a@example.com, b@example.com"],
    ]);
  });

  it("refuses the switches production keeps unset and the secret Void makes", () => {
    expect(() => appSecrets(exported({ SERVE_TOKEN_SECRET: "s", DEK_PUB_DEV_LOGIN: "1" }))).toThrow(
      "DEK_PUB_DEV_LOGIN",
    );
    expect(() => appSecrets(exported({ DEK_PUB_OPEN_SIGN_UP: "1" }))).toThrow(
      "DEK_PUB_OPEN_SIGN_UP",
    );
    expect(() => appSecrets(exported({ BETTER_AUTH_SECRET: "s" }))).toThrow("BETTER_AUTH_SECRET");
  });

  it("refuses an export with nothing in it", () => {
    expect(() => appSecrets(exported({}))).toThrow("no secrets");
    expect(() => appSecrets("{}")).toThrow("no secrets");
  });
});
