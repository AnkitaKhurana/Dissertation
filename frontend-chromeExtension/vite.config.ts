import { resolve } from "path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "",
  plugins: [react()],
  publicDir: "public",
  build: {
    outDir: "dist",
    sourcemap: false,  // Disable sourcemaps for extension size (<20MB requirement)
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "src/popup.html"),
        options: resolve(__dirname, "src/options.html"),
        background: resolve(__dirname, "src/extension/background.ts"),
        content: resolve(__dirname, "src/extension/content.ts"),
        offscreen: resolve(__dirname, "src/extension/offscreen.ts"),
      },
      output: {
        // Use IIFE so content script bundles run as classic scripts in pages
        // (some Chromium environments don't treat content scripts as modules).
        format: "iife",
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === "background") return "background.js";
          if (chunkInfo.name === "content") return "content.js";
          if (chunkInfo.name === "offscreen") return "offscreen.js";
          return "assets/[name].js";
        },
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
