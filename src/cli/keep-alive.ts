import type { DevServer } from "../server/dev.ts";
import { writeDevEvent } from "./format.ts";

export async function keepDevServer(server: DevServer): Promise<void> {
  const shutdown = (): void => {
    void server.close().finally(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  void (async () => {
    for await (const event of server.events) {
      writeDevEvent(event, process.stderr);
    }
  })();
  await new Promise<void>(() => {
    /* keep the process alive until killed */
  });
}
