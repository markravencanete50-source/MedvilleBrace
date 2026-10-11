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
          /* Firebase is for the dashboard only: its own chunks, so the shop never downloads it. Firestore loads after sign-in. */
          if (/node_modules\/(@firebase\/firestore|firebase\/firestore)\//.test(id)) return "firebase-firestore";
          if (/node_modules\/(@firebase\/auth|firebase\/auth)\//.test(id)) return "firebase-auth";
          if (/node_modules\/(@firebase|firebase|idb)\//.test(id)) return "firebase-core";
          if (id.includes("node_modules")) return "vendor";
        },
      },
    },
  },
});
