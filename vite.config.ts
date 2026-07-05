import path from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const config = defineConfig({
  plugins: [
    devtools(),
    cloudflare(),
    tailwindcss(),
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
    }),
    viteReact(),
    VitePWA({
      // The app always boots from the precached shell; PwaUpdatePrompt shows a
      // toast when a new build is waiting and swaps on user confirmation.
      registerType: "prompt",
      manifest: {
        id: "/",
        name: "Productivity",
        short_name: "Productivity",
        description: "Notes, accounts, and transactions — local-first.",
        display: "standalone",
        theme_color: "#171717",
        background_color: "#171717",
        icons: [
          { src: "/pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "/pwa-512x512.png", sizes: "512x512", type: "image/png" },
          { src: "/pwa-maskable-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // wasm matters: without it the sqlite-wasm binary isn't precached and
        // the app can't open the local database offline.
        globPatterns: ["**/*.{js,css,html,wasm,svg,png,ico,woff2}"],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        // Mirrors run_worker_first in wrangler.jsonc — never serve the SPA
        // shell for API, RPC, sync, or agent traffic.
        navigateFallbackDenylist: [/^\/rpc\//, /^\/api\//, /^\/user-db\//, /^\/agents\//],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  optimizeDeps: {
    // sqlite-wasm can't be pre-bundled (WASM). The packages that import it must
    // also be excluded, otherwise Vite pre-bundles them with a bare
    // "@sqlite.org/sqlite-wasm" import it can't resolve from .vite/deps.
    exclude: ["@sqlite.org/sqlite-wasm", "@sqlite-sync/core"],
  },
  worker: { format: "es" },
});

export default config;
