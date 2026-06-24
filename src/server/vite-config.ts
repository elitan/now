import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import type { InlineConfig } from "vite";
import { nowPlugin } from "../vite/plugin";
import { resolveRuntimeFile } from "../vite/paths";

export interface NowRuntimePaths {
  client: string;
  server: string;
  index: string;
}

export function resolveNowRuntimePaths(): NowRuntimePaths {
  return {
    client: resolveRuntimeFile(["../client/index.js", "../client/index.tsx"]),
    server: resolveRuntimeFile(["../server/index.js", "../server/index.ts"]),
    index: resolveRuntimeFile(["../index.js", "../index.ts"]),
  };
}

export function createViteConfig(projectRoot: string, htmlInput?: string): InlineConfig {
  const root = resolve(projectRoot);
  const runtime = resolveNowRuntimePaths();

  const config: InlineConfig = {
    root,
    configFile: false,
    appType: "custom",
    plugins: [react(), nowPlugin({ projectRoot: root })],
    resolve: {
      alias: [
        {
          find: "now/client",
          replacement: runtime.client,
        },
        {
          find: "now/server",
          replacement: runtime.server,
        },
        {
          find: "now",
          replacement: runtime.index,
        },
      ],
    },
    server: {
      middlewareMode: true,
    },
  };

  if (htmlInput) {
    config.build = {
      outDir: "dist/client",
      emptyOutDir: true,
      rollupOptions: {
        input: htmlInput,
      },
    };
  }

  return config;
}
