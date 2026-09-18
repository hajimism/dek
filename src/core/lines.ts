export function splitLines(source: string): string[] {
  return source.split(/\r?\n/);
}

export function joinLines(source: string, lines: string[]): string {
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  return lines.join(newline);
}
