import { annotateScript, liveReloadScript, playerScript } from "../../src/runtime/player.ts";

let cached: { playerScript: string; liveReloadScript: string; annotateScript: string } | undefined;

export async function playerEmbed(): Promise<{
  playerScript: string;
  liveReloadScript: string;
  annotateScript: string;
}> {
  cached ??= {
    playerScript: await playerScript(),
    liveReloadScript: liveReloadScript(),
    annotateScript: await annotateScript(),
  };
  return cached;
}
