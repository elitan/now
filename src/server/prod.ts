import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { ServerBuildManifest } from "../routing/types";
import type { ApiRouteModule, RuntimeApiRoute } from "./api";
import { dispatchApiRequest } from "./api";
import { createServerErrorResponse, startNodeServer, type RunningServer } from "./http";
import { handleProxyRequest, type ProxyModule, type RuntimeProxy } from "./proxy";
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
  const proxy = createRuntimeProxy(serverDirectory, manifest);

  return async function handleProductionRequest(request: Request): Promise<Response> {
    try {
      return await handleProxyRequest(
        request,
        proxy,
        async function handleDownstreamRequest(proxiedRequest) {
          const apiResponse = await dispatchApiRequest(proxiedRequest, routes);

          if (apiResponse) {
            return apiResponse;
          }

          const staticResponse = await serveStaticFile(proxiedRequest, clientDirectory);

          if (staticResponse) {
            return staticResponse;
          }

          return serveSpaFallback(clientDirectory);
        },
      );
    } catch (error) {
      return createServerErrorResponse(error);
    }
  };
}

function createRuntimeProxy(
  serverDirectory: string,
  manifest: ServerBuildManifest,
): RuntimeProxy | undefined {
  const proxyManifest = manifest.proxy;

  if (!proxyManifest) {
    return undefined;
  }

  return {
    filePath: proxyManifest.modulePath,
    load: function loadProxyModule(): Promise<ProxyModule> {
      return import(
        pathToFileURL(join(serverDirectory, proxyManifest.modulePath)).href
      ) as Promise<ProxyModule>;
    },
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
