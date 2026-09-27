import { describe, expect, test } from "bun:test";
import { watchTargets } from "../../src/server/project-watch.ts";

describe("watchTargets", () => {
  test("names every deck by its directory, failed ones too, once each", () => {
    expect(
      watchTargets({
        decks: [
          { name: "demo", dir: "/project/decks/demo" },
          { name: "demo", dir: "/project/decks/demo" },
        ],
        failed: [{ name: "broken", dir: "/project/decks/broken" }],
      }),
    ).toEqual(
      new Map([
        ["/project/decks/demo", "demo"],
        ["/project/decks/broken", "broken"],
      ]),
    );
  });
});
