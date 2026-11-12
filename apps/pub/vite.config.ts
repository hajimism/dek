import { defineConfig } from "vite";
import { voidPlugin } from "void";
import { voidSvelte } from "@void/svelte/plugin";

export default defineConfig({
  plugins: [voidPlugin(), voidSvelte()],
});
