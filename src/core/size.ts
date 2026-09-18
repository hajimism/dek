export type Size = {
  width: number;
  height: number;
};

export function logicalSize(ratio?: "16:9" | "4:3"): Size {
  if (ratio === "4:3") {
    return { width: 1024, height: 768 };
  }
  return { width: 1280, height: 720 };
}
