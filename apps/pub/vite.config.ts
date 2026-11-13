import { voidSvelte } from "@void/svelte/plugin";
import { defineConfig } from "vite";
import { voidPlugin } from "void";

export default defineConfig({
  // DEK_PUB_STATE moves the local D1, R2 and KV, so a test run starts from nothing.
  plugins: [voidPlugin({ persistTo: process.env.DEK_PUB_STATE }), voidSvelte()],
});
