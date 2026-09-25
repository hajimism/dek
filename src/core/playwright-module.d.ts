declare module "playwright" {
  type Viewport = { width: number; height: number };
  export type Page = {
    goto(url: string): Promise<unknown>;
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
    close(): Promise<void>;
  };
  export type BrowserContext = {
    newPage(): Promise<Page>;
    close(): Promise<void>;
  };
  export type Browser = {
    newPage(options?: { viewport?: Viewport }): Promise<Page>;
    newContext(options?: { viewport?: Viewport }): Promise<BrowserContext>;
    close(): Promise<void>;
  };
  export const chromium: {
    launch(options?: { headless?: boolean }): Promise<Browser>;
  };
}
