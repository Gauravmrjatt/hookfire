import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

import pkg from "./package.json" with { type: "json" };

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    // Proxying keeps the dashboard same-origin in dev. The engine also sends
    // CORS headers (CORS_ALLOWED_ORIGINS) for split-origin deployments.
    proxy: {
      "/v1": { target: "http://localhost:8080", changeOrigin: true },
      "/health": { target: "http://localhost:8080", changeOrigin: true },
      "/ready": { target: "http://localhost:8080", changeOrigin: true },
      "/metrics": { target: "http://localhost:8080", changeOrigin: true },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    // Split vendor code so a dependency bump doesn't invalidate the app chunk.
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: "react", test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: "router", test: /node_modules[\\/]react-router(-dom)?[\\/]/ },
            { name: "radix", test: /node_modules[\\/]@radix-ui[\\/]/ },
            { name: "query", test: /node_modules[\\/]@tanstack[\\/]/ },
            { name: "vendor", test: /node_modules[\\/]/ },
          ],
        },
      },
    },
  },
});
