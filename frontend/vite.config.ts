import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Backend dev server target for the /api proxy (override with VITE_API_PROXY).
const API_PROXY = process.env.VITE_API_PROXY || "http://127.0.0.1:8000";

export default defineConfig({
  // Locally, build straight into the backend's static dir so `npm run build` lets
  // uvicorn serve the production SPA. In Docker we set VITE_OUT_DIR=dist and copy it.
  build: {
    outDir: process.env.VITE_OUT_DIR || "../backend/app/static",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: API_PROXY, changeOrigin: true },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/apple-touch-icon-180.png"],
      manifest: {
        name: "AlVolo",
        short_name: "AlVolo",
        description: "Cattura al volo: screenshot, link e idee, arricchiti dall'AI.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        theme_color: "#0f172a",
        background_color: "#0f172a",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/icons/maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        navigateFallback: "/index.html",
        // Don't let the SPA fallback swallow API requests.
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // Items list + detail: fresh when online, last-known when offline.
            urlPattern: ({ url }) =>
              url.pathname.startsWith("/api/items") && !url.pathname.endsWith("/image"),
            handler: "NetworkFirst",
            options: {
              cacheName: "alvolo-api",
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
          {
            // Images: cache-first with a hard cap to respect iOS' ~50MB quota.
            urlPattern: ({ url }) => /\/api\/items\/.+\/image$/.test(url.pathname),
            handler: "CacheFirst",
            options: {
              cacheName: "alvolo-images",
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
        ],
      },
    }),
  ],
});
