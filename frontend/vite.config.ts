import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "./", // relative paths so the site works inside any htdocs folder
  build: {
    outDir: "../app", // XAMPP serves it at http://localhost/smart-parking/app/
    emptyOutDir: true,
  },
});
