import { defineConfig } from "vite";

// Tauri 2 frontend layout: src/ holds index.html and JS modules; the Tauri
// dev/build wraps Vite via the npm dev/build scripts. The default port is
// 1420 (Tauri convention) so tauri.conf.json can hard-code devUrl.
export default defineConfig({
  root: "src",
  publicDir: false,
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    target: "esnext",
  },
});
