import { describe, expect, test } from "bun:test";
import { chmod, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { dropEnvFileVariables, envFileWarning } from "../../src/cli/env-file.ts";
import { cliPath, runDek } from "../helpers/cli.ts";
import { withTempDir } from "../helpers/fs.ts";
import { withTempProject } from "../helpers/project.ts";

describe("dropEnvFileVariables", () => {
  test("takes out each DEK_ variable a .env file names, however the line is written", async () => {
    await withTempDir(async (dir) => {
      await writeFile(
        join(dir, ".env"),
        "DEK_RUMDL=./payload.sh\nexport DEK_PLAYWRIGHT=./w.ts\nOTHER=1\n",
      );
      await writeFile(join(dir, ".env.local"), "DEK_GITHUB_API: http://127.0.0.1:1\n");
      await writeFile(join(dir, ".env.production"), "  dek_ffmpeg = ./ffmpeg\n");
      const env: NodeJS.ProcessEnv = {
        DEK_RUMDL: "./payload.sh",
        DEK_PLAYWRIGHT: "./w.ts",
        DEK_GITHUB_API: "http://127.0.0.1:1",
        DEK_FFMPEG: "./ffmpeg",
        DEK_VOICE_PLAY: "0",
        OTHER: "1",
      };
      expect(dropEnvFileVariables(dir, env, [])).toEqual([
        "DEK_FFMPEG",
        "DEK_GITHUB_API",
        "DEK_PLAYWRIGHT",
        "DEK_RUMDL",
      ]);
      expect(env).toEqual({ DEK_VOICE_PLAY: "0", OTHER: "1" });
    });
  });

  test("leaves the environment alone without a .env file, or under --no-env-file", async () => {
    await withTempDir(async (dir) => {
      const env: NodeJS.ProcessEnv = { DEK_RUMDL: "/usr/local/bin/rumdl" };
      expect(dropEnvFileVariables(dir, env, [])).toEqual([]);
      await writeFile(join(dir, ".env"), "DEK_RUMDL=./payload.sh\n");
      expect(dropEnvFileVariables(dir, env, ["--no-env-file"])).toEqual([]);
      expect(env).toEqual({ DEK_RUMDL: "/usr/local/bin/rumdl" });
    });
  });

  test("the warning names what it ignored and where to set it instead", () => {
    const text = envFileWarning(["DEK_GITHUB_API", "DEK_RUMDL"]);
    expect(text).toStartWith("warning: ignored DEK_GITHUB_API, DEK_RUMDL: a .env file");
    expect(text).toContain("help: set it in the shell that runs dekc");
  });
});

describe("dekc where a .env sets DEK_ variables", () => {
  test("the bin asks Bun not to load .env or bunfig.toml at all", async () => {
    const [shebang] = (await Bun.file(cliPath).text()).split("\n");
    expect(shebang).toBe("#!/usr/bin/env -S bun --no-env-file --config=/dev/null");
  });

  test.serial("run through bun, which loads .env, it runs no program the .env names", async () => {
    await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
      const ran = join(root, "ran");
      const program = join(root, "program.sh");
      await writeFile(program, `#!/bin/sh\ntouch '${ran}'\n`);
      await chmod(program, 0o755);
      await writeFile(join(root, ".env"), `DEK_RUMDL=${program}\n`);

      const result = await runDek(["lint"], { cwd: root });
      expect(result.stderr).toContain("warning: ignored DEK_RUMDL");
      expect(await Bun.file(ran).exists()).toBe(false);
    });
  });
});

describe("dekc where a bunfig.toml preloads code", () => {
  test.serial("run as its bin, neither dekc nor a bun it starts runs the preload", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            slides: {
              intro: '<section class="slide" data-slug="intro"><h2>Intro</h2></section>\n',
            },
            scripts: { intro: "export default { draw() {} } satisfies DekSlide;\n" },
          },
        ],
      },
      async (root) => {
        const ran = join(root, "ran");
        await writeFile(
          join(root, "preload.ts"),
          `require("node:fs").appendFileSync(${JSON.stringify(ran)}, process.argv.join(" ") + "\\n");\n`,
        );
        await writeFile(join(root, "bunfig.toml"), 'preload = ["./preload.ts"]\n');

        // The bin itself, so the shebang runs: runDek starts `bun src/cli.ts`, which skips it.
        const proc = Bun.spawn([cliPath, "lint"], { cwd: root, stdout: "pipe", stderr: "pipe" });
        await proc.exited;
        expect(await Bun.file(ran).exists()).toBe(false);
      },
    );
  });
});
