declare module "playwright" {
  export const chromium: {
    launch(options?: { headless?: boolean }): Promise<{
      newPage(options?: { viewport?: { width: number; height: number } }): Promise<{
        setContent(html: string, options?: { waitUntil?: string }): Promise<void>;
        emulateMedia(options: { reducedMotion?: "reduce" | "no-preference" }): Promise<void>;
        evaluate<T, A = unknown>(fn: (arg: A) => T | Promise<T>, arg?: A): Promise<T>;
        screenshot(options: {
          path?: string;
          fullPage?: boolean;
          type?: "png" | "jpeg";
        }): Promise<Buffer>;
        addScriptTag(options: { content: string }): Promise<unknown>;
        pdf(options: {
          path: string;
          width?: string;
          height?: string;
          printBackground?: boolean;
          margin?: { top?: string; right?: string; bottom?: string; left?: string };
        }): Promise<Buffer>;
      }>;
      close(): Promise<void>;
    }>;
  };
}
