import { vitePlugin as remix } from "@remix-run/dev";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [remix()],
  server: {
    port: Number(process.env.PORT || 3000),
    allowedHosts: true,
  },
});
