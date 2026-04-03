import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    hmr: {
      clientPort: 0, // This tells Vite to use the same port as the page
    },
  },
});
