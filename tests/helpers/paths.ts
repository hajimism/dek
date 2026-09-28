import { join } from "node:path";

const fixturesDir = join(import.meta.dir, "..", "fixtures");
export const scriptFixturesDir = join(fixturesDir, "script");
export const projectFixturesDir = join(fixturesDir, "projects");
export const assetFixturesDir = join(fixturesDir, "assets");
export const repoRoot = join(import.meta.dir, "..", "..");
