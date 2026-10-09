import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    /* The catalog index changes only when the catalog is rebuilt, so it gets
       its own long-lived chunk instead of riding along with every code change. */
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("src/data/catalog.json")) return "catalog";
          if (id.includes("node_modules")) return "vendor";
        },
      },
    },
  },
});
