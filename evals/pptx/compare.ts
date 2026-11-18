/// <reference lib="dom" />

// A slide as the browser drew it against the same slide as a renderer drew the file, line by
// line: where each line's ink starts and ends in both, and how much of it coincides. The ink of
// text is what differs between a picture with the text and one without, so it is found whatever
// the text is drawn on.

export type CompareInput = {
  /** The slide's size in CSS pixels, and how many pixels of the grid stand for one. */
  width: number;
  height: number;
  scale: number;
  /** The browser's slide with and without its text, as data URLs. */
  browser: { full: string; bare: string };
  /** The renderer's, drawn from the file with and without its text. */
  renderer: { full: string; bare: string };
  lines: Array<{ left: number; top: number; right: number; bottom: number }>;
};

export type LineFinding = {
  /** Whether the renderer set this line as text, and did not just show it in a picture. */
  native: boolean;
  /**
   * How far each edge of the line's ink lies from the browser's, in CSS pixels: `right` is where
   * the line ends, positive when it runs longer.
   */
  left: number;
  right: number;
  top: number;
  bottom: number;
  /** 0..1: how much of each drawing's ink lies within a pixel of the other's. */
  match: number;
  /**
   * Ink the renderer set under the line where the browser set none, as a share of the line's own:
   * above nothing, with a line that ends early, it is a line the renderer broke again.
   */
  spill: number;
};

export type CompareResult = {
  lines: LineFinding[];
  /** The mean difference between the two whole pictures, of 255. */
  difference: number;
  /** The share of pixels that differ by more than a fifth of the range. */
  differing: number;
  /** Both inks in one picture: the browser's alone in red, the renderer's alone in blue. */
  overlay: string;
};

/** Runs in the page, shipped by `page.evaluate`, so it references nothing outside itself. */
export async function compareInPage(input: CompareInput): Promise<CompareResult> {
  const W = Math.round(input.width * input.scale);
  const H = Math.round(input.height * input.scale);
  const load = async (url: string): Promise<ImageBitmap> =>
    createImageBitmap(await (await fetch(url)).blob());
  type Place = (image: ImageBitmap) => [x: number, y: number, width: number, height: number];
  const pixels = (image: ImageBitmap, place: Place): Uint8ClampedArray => {
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      throw new Error("no canvas");
    }
    context.fillStyle = "#fff";
    context.fillRect(0, 0, W, H);
    context.drawImage(image, ...place(image));
    return context.getImageData(0, 0, W, H).data;
  };
  const distance = (a: Uint8ClampedArray, b: Uint8ClampedArray, at: number): number =>
    Math.max(
      Math.abs((a[at] ?? 0) - (b[at] ?? 0)),
      Math.abs((a[at + 1] ?? 0) - (b[at + 1] ?? 0)),
      Math.abs((a[at + 2] ?? 0) - (b[at + 2] ?? 0)),
    );
  const mean = (a: Uint8ClampedArray, b: Uint8ClampedArray): number => {
    let sum = 0;
    for (let at = 0; at < a.length; at += 4) {
      sum += distance(a, b, at);
    }
    return sum / (a.length / 4);
  };

  const stretch: Place = () => [0, 0, W, H];
  const browserFull = pixels(await load(input.browser.full), stretch);
  const browserBare = pixels(await load(input.browser.bare), stretch);
  // A renderer's picture may be a few pixels off the slide's proportions: it is laid where the
  // slide without its text agrees best with the browser's, stretched, from the top, or centered.
  const rendererFullImage = await load(input.renderer.full);
  const rendererBareImage = await load(input.renderer.bare);
  const places: Place[] = [
    stretch,
    (image) => [0, 0, W, (image.height * W) / image.width],
    (image) => [0, (H - (image.height * W) / image.width) / 2, W, (image.height * W) / image.width],
  ];
  let place = stretch;
  let best = Number.POSITIVE_INFINITY;
  for (const each of places) {
    const off = mean(browserBare, pixels(rendererBareImage, each));
    if (off < best - 1e-9) {
      best = off;
      place = each;
    }
  }
  const rendererFull = pixels(rendererFullImage, place);
  const rendererBare = pixels(rendererBareImage, place);

  const INK = 32;
  const inkOf = (full: Uint8ClampedArray, bare: Uint8ClampedArray): Uint8Array => {
    const ink = new Uint8Array(W * H);
    for (let at = 0; at < ink.length; at++) {
      ink[at] = distance(full, bare, at * 4) > INK ? 1 : 0;
    }
    return ink;
  };
  /** The ink, grown by `radius` pixels each way. */
  const grown = (ink: Uint8Array, radius: number): Uint8Array => {
    const across = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (ink[y * W + x]) {
          for (let dx = Math.max(0, x - radius); dx <= Math.min(W - 1, x + radius); dx++) {
            across[y * W + dx] = 1;
          }
        }
      }
    }
    const both = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (across[y * W + x]) {
          for (let dy = Math.max(0, y - radius); dy <= Math.min(H - 1, y + radius); dy++) {
            both[dy * W + x] = 1;
          }
        }
      }
    }
    return both;
  };
  const browserInk = inkOf(browserFull, browserBare);
  const rendererInk = inkOf(rendererFull, rendererBare);
  const near = Math.max(1, Math.round(input.scale));
  const browserNear = grown(browserInk, near);
  const rendererNear = grown(rendererInk, near);

  type Region = { left: number; top: number; right: number; bottom: number };
  const grid = (region: Region): Region => ({
    left: Math.max(0, Math.floor(region.left * input.scale)),
    top: Math.max(0, Math.floor(region.top * input.scale)),
    right: Math.min(W, Math.ceil(region.right * input.scale)),
    bottom: Math.min(H, Math.ceil(region.bottom * input.scale)),
  });
  /** The ink's box inside a region, in grid pixels, and how many pixels of it there are. */
  const extent = (ink: Uint8Array, region: Region): (Region & { count: number }) | undefined => {
    const { left, top, right, bottom } = grid(region);
    const found = { left: right, top: bottom, right: left, bottom: top, count: 0 };
    for (let y = top; y < bottom; y++) {
      for (let x = left; x < right; x++) {
        if (ink[y * W + x]) {
          found.count++;
          found.left = Math.min(found.left, x);
          found.right = Math.max(found.right, x + 1);
          found.top = Math.min(found.top, y);
          found.bottom = Math.max(found.bottom, y + 1);
        }
      }
    }
    return found.count > 0 ? found : undefined;
  };
  /** How many of `ink`'s pixels in a region are also in `other`, or, with `apart`, are not. */
  const shared = (ink: Uint8Array, other: Uint8Array, region: Region, apart = false): number => {
    const { left, top, right, bottom } = grid(region);
    let count = 0;
    for (let y = top; y < bottom; y++) {
      for (let x = left; x < right; x++) {
        if (ink[y * W + x] && Boolean(other[y * W + x]) !== apart) {
          count++;
        }
      }
    }
    return count;
  };

  const lines = input.lines.map((line, index): LineFinding => {
    const height = line.bottom - line.top;
    const width = line.right - line.left;
    // The room a line may run into: a part of its own width each way, up to halfway to whatever
    // other line shares its band or stands above or below it.
    const room: Region = {
      left: line.left - Math.max(24, width * 0.3),
      top: line.top - height * 0.5,
      right: line.right + Math.max(24, width * 0.3),
      bottom: line.bottom + height * 0.5,
    };
    const others = input.lines.filter((_, at) => at !== index);
    for (const other of others) {
      const column = Math.min(line.right, other.right) - Math.max(line.left, other.left) > 0;
      if (column && other.bottom <= line.top + height / 2) {
        room.top = Math.max(room.top, (other.bottom + line.top) / 2);
      }
      if (column && other.top >= line.bottom - height / 2) {
        room.bottom = Math.min(room.bottom, (other.top + line.bottom) / 2);
      }
    }
    // Whatever else reaches into the room's height from a side ends the room on that side: a
    // caption a few pixels higher is not this line's ink.
    for (const other of others) {
      const beside = Math.min(room.bottom, other.bottom) - Math.max(room.top, other.top) > 0;
      if (beside && other.right <= line.left + 1) {
        room.left = Math.max(room.left, (other.right + line.left) / 2);
      }
      if (beside && other.left >= line.right - 1) {
        room.right = Math.min(room.right, (other.left + line.right) / 2);
      }
      // A line that lies inside another, as what a pseudo-element draws inside a sentence does,
      // has no room of its own to run into: the ink around it is the other's.
      if (beside && other.left < line.left + 1 && other.right > line.right - 1) {
        room.left = Math.max(room.left, line.left - 2);
        room.right = Math.min(room.right, line.right + 2);
      }
    }
    const own: Region = {
      left: line.left - 2,
      top: room.top,
      right: line.right + 2,
      bottom: room.bottom,
    };
    const drawn = extent(browserInk, own);
    const set = extent(rendererInk, room);
    if (!drawn || !set || set.count < drawn.count * 0.2) {
      return { native: false, left: 0, right: 0, top: 0, bottom: 0, match: 0, spill: 0 };
    }
    const recall = shared(browserInk, rendererNear, own) / drawn.count;
    const precision = shared(rendererInk, browserNear, room) / set.count;
    const under: Region = {
      left: line.left - 2,
      top: line.bottom,
      right: line.right + 2,
      bottom: line.bottom + height,
    };
    return {
      native: true,
      left: (set.left - drawn.left) / input.scale,
      right: (set.right - drawn.right) / input.scale,
      top: (set.top - drawn.top) / input.scale,
      bottom: (set.bottom - drawn.bottom) / input.scale,
      match: recall + precision > 0 ? (2 * recall * precision) / (recall + precision) : 0,
      spill: shared(rendererInk, browserNear, under, true) / drawn.count,
    };
  });

  let differing = 0;
  for (let at = 0; at < browserFull.length; at += 4) {
    if (distance(browserFull, rendererFull, at) > 51) {
      differing++;
    }
  }
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("no canvas");
  }
  const overlay = context.createImageData(W, H);
  for (let at = 0; at < W * H; at++) {
    const [b, r] = [browserInk[at], rendererInk[at]];
    const color = b && r ? [90, 90, 90] : b ? [220, 40, 40] : r ? [40, 80, 220] : [255, 255, 255];
    overlay.data.set([...color, 255], at * 4);
  }
  context.putImageData(overlay, 0, 0);
  return {
    lines,
    difference: mean(browserFull, rendererFull),
    differing: differing / (W * H),
    overlay: canvas.toDataURL("image/png"),
  };
}

export type RasterInput = { picture: string };

/** The share of a picture's pixels that show anything: 1 for one with no alpha. Runs in the page. */
export async function coverageInPage(input: RasterInput): Promise<number> {
  const image = await createImageBitmap(await (await fetch(input.picture)).blob());
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("no canvas");
  }
  context.drawImage(image, 0, 0);
  const { data } = context.getImageData(0, 0, image.width, image.height);
  let shown = 0;
  for (let at = 3; at < data.length; at += 4) {
    if ((data[at] ?? 0) > 0) {
      shown++;
    }
  }
  return shown / (data.length / 4);
}
