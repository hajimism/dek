import { threadLabel } from "../pub/thread.ts";
import type { FormattedError } from "./format.ts";
import type { PubResult } from "./pub.ts";
import { countSummary, displayDiagnostics } from "./text.ts";

/** What a `dekc pub` subcommand did, as text. */
export function formatPub(data: PubResult): string {
  switch (data.action) {
    case "login":
      return data.status === "pending"
        ? `open ${data.url} and enter ${data.code} to sign in, then run \`${data.next}\``
        : `signed in to ${data.server} as @${data.me.handle} (key kept in the ${data.stored === "keychain" ? "OS keychain" : "credentials file"})`;
    case "logout":
      return [
        data.revoked
          ? `revoked the key on ${data.server}`
          : data.reason === undefined
            ? `no key to revoke on ${data.server}`
            : `did not revoke the key: ${data.reason}`,
        data.forgotten ? "forgot the key" : "no key was kept here",
      ].join("\n");
    case "whoami":
      return `@${data.me.handle} (${data.me.name}) on ${data.server}${data.key === "env" ? ", from DEK_TOKEN" : ""}`;
    case "publish":
      if (!data.published) {
        return `nothing was published: lint found ${countSummary(data.diagnostics)}`;
      }
      return [
        `published version ${data.n} of ${data.url}`,
        data.current === data.n
          ? `readers see version ${data.n}`
          : `readers still see ${data.current === null ? "no version" : `version ${data.current}`}`,
        ...(data.diagnostics.length > 0 ? [`lint found ${countSummary(data.diagnostics)}`] : []),
        ...data.changed.map((path) => `wrote pub: into ${path}; commit it`),
      ].join("\n");
    case "promote":
      return `readers see version ${data.current} of ${data.url}`;
    case "share":
    case "status": {
      const lines = [
        `${data.url}  ${data.visibility}`,
        `script ${data.scriptPublic ? "shown" : "hidden"}, embed ${data.embed ? "on" : "off"}, comments ${data.comments}`,
        `readers see ${data.current === null ? "no version" : `version ${data.current}`}; newest is ${data.latest === null ? "none" : data.latest}`,
      ];
      if (data.action === "status") {
        lines.push(
          data.local.published
            ? "the newest version is the source as it is here"
            : "the source here differs from the newest version",
        );
      }
      return lines.join("\n");
    }
    case "open":
      return data.url;
    case "comments":
      if (data.comments.length === 0) {
        return "no comments";
      }
      return data.comments
        .flatMap((row) => {
          const beat = row.step === "0" ? row.slug : `${row.slug} › ${row.step}`;
          const status = row.status === "open" ? "" : ` (${row.status})`;
          const author = row.author.handle ? `@${row.author.handle}` : `${row.author.name} (guest)`;
          const targets = row.targets.map((target) =>
            target.kind === "element"
              ? `   ${target.path ?? "(no slide file)"}  ${target.name}${target.found ? "" : " (not found)"}`
              : target.found
                ? `   ${target.path}:${target.line}:${target.column}  ${JSON.stringify(target.quote)}`
                : `   ${target.path}  ${JSON.stringify(target.quote)} (not found)`,
          );
          const words = (text: string, mark: string) =>
            text
              .split(/\r?\n/)
              .filter((line) => line.trim() !== "")
              .map((line) => `   ${mark} ${line}`);
          return [
            `${threadLabel(row)}  ${beat}${status}  ${author}  [${row.id}]`,
            ...targets,
            ...words(row.text, ">"),
            ...row.thread.flatMap((reply) => [
              `   ${reply.author.handle ? `@${reply.author.handle}` : reply.author.name}:`,
              ...words(reply.text, "  >"),
            ]),
            `   ${row.shot}`,
          ];
        })
        .join("\n");
    case "reply":
      return `replied to ${data.comment}`;
    case "resolve":
      return `resolved ${data.comment}`;
    case "reopen":
      return `reopened ${data.comment}`;
  }
}

/** A publish that lint stopped is a run that failed, as lint's own. */
export function pubFailure(data: PubResult): FormattedError | undefined {
  if (data.action !== "publish" || data.published) {
    return undefined;
  }
  return {
    message: `lint found ${countSummary(data.diagnostics)}, so nothing was published`,
    hint: "fix each error in diagnostics, then run `dekc pub publish` again",
  };
}

/** The result with every path into the source tree as `display` shows it. */
export function pubPaths(data: PubResult, display: (path: string) => string): PubResult {
  switch (data.action) {
    case "publish":
      return data.published
        ? {
            ...data,
            diagnostics: displayDiagnostics(data.diagnostics, display),
            changed: data.changed.map(display),
          }
        : { ...data, diagnostics: displayDiagnostics(data.diagnostics, display) };
    case "comments":
      return {
        ...data,
        comments: data.comments.map((row) => ({
          ...row,
          targets: row.targets.map((target) =>
            target.path === null ? target : { ...target, path: display(target.path) },
          ),
        })),
      };
    default:
      return data;
  }
}
