import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
const target = process.env.IFSOUL_API_ORIGIN;
if (target) {
  const url = new URL(target);
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw Error("IFSOUL_API_ORIGIN must be an explicit HTTP loopback origin");
}
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: { outDir: "web-dist" },
  server: {
    proxy: target
      ? {
          "/api/demo": {
            target,
            changeOrigin: true,
            configure(proxy) {
              proxy.on("proxyReq", (request) => {
                request.removeHeader("sec-fetch-site");
                request.setHeader("Origin", new URL(target).origin);
              });
            },
          },
        }
      : undefined,
  },
});
