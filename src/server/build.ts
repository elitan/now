import { existsSync } from "node:fs";
import { mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { build as esbuildBuild, type Plugin as EsbuildPlugin } from "esbuild";
import { build as viteBuild } from "vite";
import { scanApiRoutes } from "../routing/scanner";
import type { GeneratedServerRoute, ServerBuildManifest } from "../routing/types";
import { writeGeneratedClientFiles } from "../vite/generated";
import { normalizePath, resolveRuntimeFile } from "../vite/paths";
import { findProxyFile } from "./proxy";
import { createViteConfig, resolveNowRuntimePaths } from "./vite-config";

export async function buildProject(projectRoot: string): Promise<void> {
  const root = await realpath(resolve(projectRoot));
  const runtime = resolveNowRuntimePaths();
  const generated = await writeGeneratedClientFiles(root, runtime.client);
  const distDirectory = join(root, "dist");

  await rm(distDirectory, {
    recursive: true,
    force: true,
  });

  await viteBuild(createViteConfig(root, generated.html));
  await normalizeClientIndex(root, generated.html);
  await buildServer(root);
}

async function normalizeClientIndex(projectRoot: string, generatedHtml: string): Promise<void> {
  const indexOutput = join(projectRoot, "dist", "client", "index.html");

  if (!existsSync(indexOutput)) {
    const generatedRelativePath = relative(projectRoot, generatedHtml);
    const generatedOutput = join(projectRoot, "dist", "client", generatedRelativePath);
    const html = await readFile(generatedOutput, "utf8");
    await writeFile(indexOutput, html, "utf8");
  }

  await rm(join(projectRoot, "dist", "client", ".now"), {
    recursive: true,
    force: true,
  });
}

async function buildServer(projectRoot: string): Promise<void> {
  const serverDirectory = join(projectRoot, "dist", "server");
  const routeDirectory = join(serverDirectory, "routes");
  const apiRoutes = scanApiRoutes(projectRoot);
  const generatedRoutes: GeneratedServerRoute[] = [];
  const proxyFile = findProxyFile(projectRoot);

  await mkdir(routeDirectory, {
    recursive: true,
  });

  for (const route of apiRoutes) {
    const modulePath = `routes/${route.id}.mjs`;
    const outfile = join(serverDirectory, modulePath);
    await bundleEntry(route.filePath, outfile);
    generatedRoutes.push({
      id: route.id,
      routePath: route.routePath,
      modulePath,
      segments: route.segments,
    });
  }

  const manifest: ServerBuildManifest = {
    apiRoutes: generatedRoutes,
  };

  if (proxyFile) {
    const modulePath = "proxy.mjs";
    await bundleEntry(proxyFile, join(serverDirectory, modulePath));
    manifest.proxy = {
      modulePath,
    };
  }

  await writeFile(
    join(serverDirectory, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf8",
  );
}

async function bundleEntry(entry: string, outfile: string): Promise<void> {
  await esbuildBuild({
    entryPoints: [entry],
    outfile,
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node20",
    sourcemap: true,
    packages: "external",
    plugins: [nowAliasPlugin()],
  });
}

function nowAliasPlugin(): EsbuildPlugin {
  const runtime = {
    client: resolveRuntimeFile(["../client/index.js", "../client/index.tsx"]),
    server: resolveRuntimeFile(["../server/index.js", "../server/index.ts"]),
    index: resolveRuntimeFile(["../index.js", "../index.ts"]),
  };

  return {
    name: "now-alias",
    setup(build) {
      build.onResolve({ filter: /^now\/client$/ }, function resolveClient() {
        return {
          path: runtime.client,
        };
      });

      build.onResolve({ filter: /^now\/server$/ }, function resolveServer() {
        return {
          path: runtime.server,
        };
      });

      build.onResolve({ filter: /^now$/ }, function resolveIndex() {
        return {
          path: runtime.index,
        };
      });
    },
  };
}

export function relativeToProject(projectRoot: string, file: string): string {
  return normalizePath(relative(projectRoot, file));
}
