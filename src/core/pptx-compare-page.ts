// A slide as the browser drew it beside the same slide as a renderer drew the file, in one
// picture, with where they differ marked, and how far apart they are. It runs in the page.

export type CompareRequest = {
  width: number;
  height: number;
  browser: string;
  renderer: string;
};

export type CompareAnswer = {
  /** The mean difference of the two pictures' pixels, 0 to 255. */
  difference: number;
  /** The share of pixels that differ by more than a glance would miss. */
  differing: number;
  /** The browser's on the left, the renderer's on the right, what differs tinted on it. */
  png: string;
};

export async function comparePptxInPage(request: CompareRequest): Promise<CompareAnswer> {
  const load = (src: string) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("a picture could not be read"));
      image.src = src;
    });
  const [browser, renderer] = await Promise.all([load(request.browser), load(request.renderer)]);
  const { width, height } = request;
  const pixels = (image: HTMLImageElement) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("no 2D canvas");
    }
    context.fillStyle = "#fff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    return context.getImageData(0, 0, width, height);
  };
  const a = pixels(browser);
  const b = pixels(renderer);
  const out = document.createElement("canvas");
  out.width = width * 2;
  out.height = height;
  const context = out.getContext("2d");
  if (!context) {
    throw new Error("no 2D canvas");
  }
  context.putImageData(a, 0, 0);
  const marked = new ImageData(new Uint8ClampedArray(b.data), width, height);
  let total = 0;
  let differ = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    const delta =
      (Math.abs((a.data[i] ?? 0) - (b.data[i] ?? 0)) +
        Math.abs((a.data[i + 1] ?? 0) - (b.data[i + 1] ?? 0)) +
        Math.abs((a.data[i + 2] ?? 0) - (b.data[i + 2] ?? 0))) /
      3;
    total += delta;
    if (delta > 48) {
      differ += 1;
      marked.data[i] = 255;
      marked.data[i + 1] = Math.round((marked.data[i + 1] ?? 0) * 0.35);
      marked.data[i + 2] = Math.round((marked.data[i + 2] ?? 0) * 0.35);
    }
  }
  context.putImageData(marked, width, 0);
  context.fillStyle = "#e11d48";
  context.fillRect(width - 1, 0, 2, height);
  const count = a.data.length / 4;
  return {
    difference: Math.round((total / count) * 100) / 100,
    differing: Math.round((differ / count) * 1000) / 1000,
    png: out.toDataURL("image/png"),
  };
}
