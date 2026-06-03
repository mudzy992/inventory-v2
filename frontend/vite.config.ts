import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const repoRoot = path.resolve(__dirname, "..");

const isBenignProxyError = (error: Error): boolean => {
  const code = (error as NodeJS.ErrnoException).code;
  return code === "ECONNABORTED" || code === "ECONNRESET" || code === "EPIPE";
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repoRoot, "");
  const devApiProxy = env.VITE_DEV_API_PROXY || "http://localhost:3000";

  return {
    envDir: repoRoot,
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src"),
      },
    },
    server: {
      proxy: {
        "/backend": {
          target: devApiProxy,
          changeOrigin: true,
          ws: true,
          configure: (proxy) => {
            proxy.on("error", (error, _req, res) => {
              if (isBenignProxyError(error)) {
                return;
              }
              if (res && "writeHead" in res && !res.headersSent) {
                res.writeHead(502, { "Content-Type": "text/plain" });
                res.end("Bad gateway");
              }
              console.error("[vite] proxy error:", error);
            });
          },
        },
      },
    },
  };
});
