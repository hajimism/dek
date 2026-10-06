import { type DevServer, startDevServer } from "../server/dev.ts";
import { generateRemotePassword, remoteBanner } from "../server/lan.ts";
import { PAIRING_TTL_MS } from "../server/pairing.ts";
import { keepDevServer } from "./keep-alive.ts";
import { qrMatrix, renderQr } from "./qr.ts";
import { shouldColor } from "./tty.ts";

export async function serveCommand(options: {
  cwd: string;
  deck?: string;
  remote?: boolean;
  visual?: boolean;
  port?: number;
}): Promise<void> {
  await runDevSession(
    {
      cwd: options.cwd,
      deck: options.deck,
      remote: options.remote === true,
      visual: options.visual === true,
      ...(options.port !== undefined ? { port: options.port } : {}),
    },
    devSessionView,
  );
}

type SessionView = { banner: string; pairPath: string };

/** What `dekc` prints once up, and which presenter view a phone pairs into. */
export function devSessionView(
  server: Pick<DevServer, "url" | "remoteUrls" | "deckDir" | "decks">,
  password: string | undefined,
): SessionView {
  const presenterPaths = server.deckDir
    ? ["presenter"]
    : server.decks.map((name) => `decks/${name}/presenter`);
  return {
    banner: devBanner(server.url, server.remoteUrls, { password, presenterPaths }),
    // One deck pairs straight into its presenter view; several, into the list to pick from.
    pairPath: presenterPaths.length === 1 ? (presenterPaths[0] as string) : "",
  };
}

/**
 * Start the dev server, print where to open it, offer a phone the presenter view, and serve until
 * stopped. `show` says what to print once the server is up, and which path a QR code opens.
 */
export async function runDevSession(
  options: Omit<Parameters<typeof startDevServer>[0], "password">,
  show: (server: DevServer, password: string | undefined) => SessionView,
): Promise<void> {
  const password = options.remote === true ? generateRemotePassword() : undefined;
  const server = await startDevServer({ ...options, password });
  const { banner, pairPath } = show(server, password);
  process.stdout.write(`${banner}\n`);
  offerPairing(server, pairPath);
  await keepDevServer(server);
}

type Terminal = {
  out: { isTTY?: boolean; write(text: string): unknown };
  input: { isTTY?: boolean; on(event: "data", listener: (chunk: Buffer) => void): unknown };
  color: boolean;
};

/**
 * With --remote, a QR code a phone scans to open `path` as the presenter, and a new one each
 * time Enter is pressed, for the next device. Only on a terminal: in a pipe or a log nobody can
 * scan it, and the code in it would only sit there.
 */
export function offerPairing(
  server: Pick<DevServer, "remoteUrls" | "pair">,
  path: string,
  terminal: Terminal = {
    out: process.stdout,
    input: process.stdin,
    color: shouldColor(process.stdout),
  },
): void {
  const pair = server.pair;
  if (!pair || terminal.out.isTTY !== true) {
    return;
  }
  const host = server.remoteUrls.find((url) => !url.includes("127.0.0.1"));
  if (!host) {
    terminal.out.write("\nno LAN address, so no QR code; connect to the network the phone is on\n");
    return;
  }
  const print = (): void => {
    terminal.out.write(`\n${pairingBlock({ host, path, code: pair(), color: terminal.color })}\n`);
  };
  print();
  if (terminal.input.isTTY === true) {
    terminal.input.on("data", (chunk) => {
      if (/[\r\n]/.test(chunk.toString())) {
        print();
      }
    });
  }
}

/** The QR code for one pairing, and what it does; the code is never printed as text. */
export function pairingBlock(options: {
  host: string;
  path: string;
  code: string;
  color: boolean;
}): string {
  const url = new URL(options.path, options.host);
  url.searchParams.set("pair", options.code);
  const what = options.path
    ? "scan to open the presenter view on a phone"
    : "scan to pick a deck as the presenter on a phone";
  const minutes = PAIRING_TTL_MS / 60_000;
  return `${renderQr(qrMatrix(url.href), { color: options.color })}\n${what} · works once, within ${minutes} minutes · Enter makes a new code`;
}

/** What the dev server prints on start: where to open it, then the keys nobody can see. */
export function devBanner(
  url: string,
  remoteUrls: string[],
  options: Parameters<typeof remoteBanner>[2],
): string {
  return `${remoteBanner(url, remoteUrls, options)}\n\np presenter view · s slide rail · a annotate · Ctrl-C stops the server`;
}
