import {
  annotateScript,
  livePlayerScript,
  liveReloadScript,
  playerScript,
} from "../../src/runtime/player.ts";

type Embed = {
  playerScript: string;
  livePlayerScript: string;
  liveReloadScript: string;
  annotateScript: string;
};

let cached: Embed | undefined;

export async function playerEmbed(): Promise<Embed> {
  cached ??= {
    playerScript: await playerScript(),
    livePlayerScript: await livePlayerScript(),
    liveReloadScript: liveReloadScript(),
    annotateScript: await annotateScript(),
  };
  return cached;
}
