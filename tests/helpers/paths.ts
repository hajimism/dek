import { join } from "node:path";

export const fixturesDir = join(import.meta.dir, "..", "fixtures");
export const scriptFixturesDir = join(fixturesDir, "script");
export const projectFixturesDir = join(fixturesDir, "projects");
export const assetFixturesDir = join(fixturesDir, "assets");
