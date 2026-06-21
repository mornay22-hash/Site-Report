// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [
      VitePWA({
        registerType: "autoUpdate",
        injectRegister: null,
        devOptions: { enabled: false },
        filename: "sw.js",
        manifest: false, // we ship a hand-written manifest at public/manifest.webmanifest
        workbox: {
          navigateFallback: "/",
          navigateFallbackDenylist: [/^\/~oauth/, /^\/api\//, /^\/_/],
          globPatterns: ["**/*.{js,css,html,ico,png,svg,webp,woff,woff2}"],
          runtimeCaching: [
            {
              urlPattern: ({ request, url }) =>
                request.mode === "navigate" && !url.pathname.startsWith("/~oauth"),
              handler: "NetworkFirst",
              options: {
                cacheName: "mjw-html",
                networkTimeoutSeconds: 4,
                expiration: { maxEntries: 32, maxAgeSeconds: 60 * 60 * 24 * 14 },
              },
            },
            {
              urlPattern: ({ url, sameOrigin }) =>
                sameOrigin && /\.(?:js|css|woff2?|png|jpg|jpeg|svg|webp|ico)$/.test(url.pathname),
              handler: "CacheFirst",
              options: {
                cacheName: "mjw-assets",
                expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
              },
            },
            {
              // Cache logo / asset proxy
              urlPattern: ({ url }) => url.pathname.startsWith("/__l5e/assets-v1/"),
              handler: "CacheFirst",
              options: {
                cacheName: "mjw-cdn-assets",
                expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 },
              },
            },
          ],
        },
      }),
    ],
  },
});
