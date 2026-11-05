import { defineConfig } from "vite";
export default defineConfig({
  publicDir: false,
  build: {
    outDir: "dist",
    lib: {
      entry: {
        index: "src/index.ts",
        simulation: "src/simulation.ts",
        adapter: "src/adapter.ts",
      },
      cssFileName: "style",
      formats: ["es"],
      fileName: (_, name) => `${name}.js`,
    },
    rollupOptions: {
      external: ["@ifsoul/adapter-sdk"],
      output: { assetFileNames: "[name][extname]" },
    },
  },
});
