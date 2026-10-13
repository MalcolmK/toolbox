import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Keep this aligned with the repository name used by GitHub Pages.
  base: "/LibraryMerger/",
});
