import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    watch: {
      usePolling: true,
      interval: 120,
    },
    hmr: {
      host: "localhost",
      port: 5173,
      clientPort: 5173,
    },
  },
});
