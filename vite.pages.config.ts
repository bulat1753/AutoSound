import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react()],
  define: { "import.meta.env.VITE_PREVIEW": JSON.stringify("true") },
  build: { outDir: "pages-build", rollupOptions: { input: "preview.html" } },
});
