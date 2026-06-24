import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { ServerBuildManifest } from "../routing/types";
import type { ApiRouteModule, RuntimeApiRoute } from "./api";
import { dispatchApiRequest } from "./api";
import { startNodeServer, type RunningServer } from "./http";
import { serveSpaFallback, serveStaticFile } from "./static";

export interface StartOptions {
  port?: number;
  hostname?: string;
}

export async function startProductionServer(
  projectRoot: string,
  options: StartOptions = {},
): Promise<RunningServer> {
  const root = resolve(projectRoot);
  const handler = await createProductionFetchHandler(root);

  return startNodeServer(handler, options.port ?? 3000, options.hostname ?? "127.0.0.1");
}

export async function createProductionFetchHandler(
  projectRoot: string,
): Promise<(request: Request) => Promise<Response>> {
  const root = resolve(projectRoot);
  const clientDirectory = join(root, "dist", "client");
  const serverDirectory = join(root, "dist", "server");
  const manifest = await readManifest(serverDirectory);
  const routes = createRuntimeApiRoutes(serverDirectory, manifest);

  return async function handleProductionRequest(request: Request): Promise<Response> {
    const apiResponse = await dispatchApiRequest(request, routes);

    if (apiResponse) {
      return apiResponse;
    }

    const staticResponse = await serveStaticFile(request, clientDirectory);

    if (staticResponse) {
      return staticResponse;
    }

    return serveSpaFallback(clientDirectory);
  };
}

async function readManifest(serverDirectory: string): Promise<ServerBuildManifest> {
  const text = await readFile(join(serverDirectory, "manifest.json"), "utf8");
  return JSON.parse(text) as ServerBuildManifest;
}

function createRuntimeApiRoutes(
  serverDirectory: string,
  manifest: ServerBuildManifest,
): RuntimeApiRoute[] {
  return manifest.apiRoutes.map(function mapRoute(route) {
    return {
      id: route.id,
      routePath: route.routePath,
      filePath: route.modulePath,
      segments: route.segments,
      load: function loadRouteModule(): Promise<ApiRouteModule> {
        return import(
          pathToFileURL(join(serverDirectory, route.modulePath)).href
        ) as Promise<ApiRouteModule>;
      },
    };
  });
}
