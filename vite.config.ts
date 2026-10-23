import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "web",
  plugins: [react()],
  build: { outDir: "../studio-dist", emptyOutDir: true },
  server: {
    hmr: { port: 4311, host: "127.0.0.1" },
    fs: { allow: [process.cwd()] },
  },
});
