import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import type { InlineConfig } from "vite";
import { next2Plugin } from "../vite/plugin";
import { resolveRuntimeFile } from "../vite/paths";

export interface Next2RuntimePaths {
  client: string;
  server: string;
  index: string;
}

export function resolveNext2RuntimePaths(): Next2RuntimePaths {
  return {
    client: resolveRuntimeFile(["../client/index.js", "../client/index.tsx"]),
    server: resolveRuntimeFile(["../server/index.js", "../server/index.ts"]),
    index: resolveRuntimeFile(["../index.js", "../index.ts"]),
  };
}

export function createViteConfig(projectRoot: string, htmlInput?: string): InlineConfig {
  const root = resolve(projectRoot);
  const runtime = resolveNext2RuntimePaths();

  const config: InlineConfig = {
    root,
    configFile: false,
    appType: "custom",
    plugins: [react(), next2Plugin({ projectRoot: root })],
    resolve: {
      alias: [
        {
          find: "next2/client",
          replacement: runtime.client,
        },
        {
          find: "next2/server",
          replacement: runtime.server,
        },
        {
          find: "next2",
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
