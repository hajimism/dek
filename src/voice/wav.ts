export type PcmWav = {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  pcm: Buffer;
};

export function encodeWav(wav: PcmWav): Buffer {
  const blockAlign = (wav.channels * wav.bitsPerSample) / 8;
  const byteRate = wav.sampleRate * blockAlign;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + wav.pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(wav.channels, 22);
  header.writeUInt32LE(wav.sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(wav.bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(wav.pcm.length, 40);
  return Buffer.concat([header, wav.pcm]);
}

export function parseWav(buf: Buffer): PcmWav {
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("not a wav file");
  }
  let offset = 12;
  let sampleRate = 24000;
  let channels = 1;
  let bitsPerSample = 16;
  let pcm = Buffer.alloc(0);
  while (offset + 8 <= buf.length) {
    const id = buf.toString("ascii", offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (id === "fmt ") {
      channels = buf.readUInt16LE(start + 2);
      sampleRate = buf.readUInt32LE(start + 4);
      bitsPerSample = buf.readUInt16LE(start + 14);
    } else if (id === "data") {
      pcm = Buffer.from(buf.subarray(start, start + size));
      break;
    }
    offset = start + size + (size % 2);
  }
  return { sampleRate, channels, bitsPerSample, pcm };
}

export function silencePcm(durationMs: number, format: Omit<PcmWav, "pcm">): Buffer {
  const bytesPerSample = (format.channels * format.bitsPerSample) / 8;
  const samples = Math.max(0, Math.round((format.sampleRate * durationMs) / 1000));
  return Buffer.alloc(samples * bytesPerSample);
}

export function wavDurationMs(buf: Buffer): number {
  const wav = parseWav(buf);
  const bytesPerSample = (wav.channels * wav.bitsPerSample) / 8;
  if (bytesPerSample <= 0 || wav.sampleRate <= 0) {
    return 0;
  }
  return Math.round((wav.pcm.length / bytesPerSample / wav.sampleRate) * 1000);
}

export function concatWavs(parts: Buffer[], pauseMs: number[], leadingMs = 0): Buffer {
  if (parts.length === 0) {
    return silentWav(Math.max(0, leadingMs));
  }
  const parsed = parts.map(parseWav);
  const format = {
    sampleRate: parsed[0]?.sampleRate ?? 24000,
    channels: parsed[0]?.channels ?? 1,
    bitsPerSample: parsed[0]?.bitsPerSample ?? 16,
  };
  for (const wav of parsed) {
    if (
      wav.sampleRate !== format.sampleRate ||
      wav.channels !== format.channels ||
      wav.bitsPerSample !== format.bitsPerSample
    ) {
      throw new Error("wav format mismatch");
    }
  }
  const chunks: Buffer[] = [];
  if (leadingMs > 0) {
    chunks.push(silencePcm(leadingMs, format));
  }
  for (const [index, wav] of parsed.entries()) {
    chunks.push(wav.pcm);
    const pause = pauseMs[index];
    if (pause && pause > 0) {
      chunks.push(silencePcm(pause, format));
    }
  }
  return encodeWav({ ...format, pcm: Buffer.concat(chunks) });
}

export function silentWav(durationMs: number): Buffer {
  const format = { sampleRate: 24000, channels: 1, bitsPerSample: 16 };
  return encodeWav({ ...format, pcm: silencePcm(durationMs, format) });
}

export function sliceWav(buf: Buffer, startMs: number, durationMs: number): Buffer {
  const wav = parseWav(buf);
  const bytesPerSample = (wav.channels * wav.bitsPerSample) / 8;
  const startSample = Math.max(0, Math.round((wav.sampleRate * startMs) / 1000));
  const durationSamples = Math.max(0, Math.round((wav.sampleRate * durationMs) / 1000));
  const startByte = Math.min(wav.pcm.length, startSample * bytesPerSample);
  const endByte = Math.min(wav.pcm.length, startByte + durationSamples * bytesPerSample);
  return encodeWav({ ...wav, pcm: Buffer.from(wav.pcm.subarray(startByte, endByte)) });
}
