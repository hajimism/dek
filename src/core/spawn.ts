export async function awaitPiped(proc: {
  stdout: ReadableStream<Uint8Array> | number;
  stderr: ReadableStream<Uint8Array> | number;
  exited: Promise<number>;
}): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout as ReadableStream<Uint8Array>).text(),
    new Response(proc.stderr as ReadableStream<Uint8Array>).text(),
    proc.exited,
  ]);
  return { stdout, stderr, exitCode };
}
