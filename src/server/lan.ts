import { type NetworkInterfaceInfo, networkInterfaces } from "node:os";

const PASSWORD_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

export function lanUrls(
  port: number,
  ifaces: NodeJS.Dict<NetworkInterfaceInfo[]> = networkInterfaces(),
): string[] {
  const urls: string[] = [];
  for (const entries of Object.values(ifaces)) {
    for (const info of entries ?? []) {
      const family = String(info.family);
      if (info.internal || (family !== "IPv4" && family !== "4")) {
        continue;
      }
      urls.push(`http://${info.address}:${port}/`);
    }
  }
  return urls;
}

/** Ten letters from an alphabet without look-alikes: 50 bits, still easy to read out to a room. */
export function generateRemotePassword(length = 10): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => PASSWORD_ALPHABET[byte % PASSWORD_ALPHABET.length]).join("");
}

export function remoteBanner(
  loopback: string,
  remoteUrls: string[],
  options: { password?: string; presenterPaths?: string[] } = {},
): string {
  const password = options.password;
  if (!password) {
    return loopback;
  }
  const lines = [loopback];
  for (const url of remoteUrls) {
    if (url !== loopback) {
      lines.push(url);
    }
  }
  const presenterHost = remoteUrls.find((url) => !url.includes("127.0.0.1")) ?? loopback;
  for (const path of options.presenterPaths ?? []) {
    lines.push(`presenter: ${new URL(path, presenterHost).href}`);
  }
  // The browser asks for a user name too; the password alone unlocks the presenter.
  lines.push(`password: ${password} (any user name)`);
  return lines.join("\n");
}
