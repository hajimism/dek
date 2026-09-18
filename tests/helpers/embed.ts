import { liveReloadScript, playerScript } from "../../src/runtime/player.ts";

let cached: { playerScript: string; liveReloadScript: string } | undefined;

export async function playerEmbed(): Promise<{
  playerScript: string;
  liveReloadScript: string;
}> {
  cached ??= {
    playerScript: await playerScript(),
    liveReloadScript: liveReloadScript(),
  };
  return cached;
}
