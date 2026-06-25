import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, resolve } from "node:path";
import { createServer as createViteServer, type ViteDevServer } from "vite";
import { scanApiRoutes } from "../routing/scanner";
import { writeGeneratedClientFiles } from "../vite/generated";
import type { ApiRouteModule, RuntimeApiRoute } from "./api";
import { dispatchApiRequest } from "./api";
import {
  createServerErrorResponse,
  createWebRequest,
  type RunningServer,
  writeWebResponse,
} from "./http";
import {
  applyHeadersToNodeResponse,
  installNodeResponseHeaderOverride,
  mergeResponseHeaders,
} from "./headers";
import { dispatchProxyRequest, findProxyFile, type ProxyModule, type RuntimeProxy } from "./proxy";
import type { StartOptions } from "./prod";
import { createViteConfig, resolveNowRuntimePaths } from "./vite-config";

export async function startDevServer(
  projectRoot: string,
  options: StartOptions = {},
): Promise<RunningServer> {
  const root = resolve(projectRoot);
  const port = options.port ?? 3000;
  const hostname = options.hostname ?? "127.0.0.1";
  const runtime = resolveNowRuntimePaths();
  const generated = await writeGeneratedClientFiles(root, runtime.client);
  const vite = await createViteServer(createViteConfig(root));
  const server = createServer(function handleRequest(request, response) {
    void handleDevRequest(root, generated.html, vite, port, request, response);
  });

  await new Promise<void>(function waitForListen(resolveListen, rejectListen) {
    server.once("error", rejectListen);
    server.listen(port, hostname, function handleListen() {
      server.off("error", rejectListen);
      resolveListen();
    });
  });

  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;

  return {
    server,
    port: actualPort,
    close: function closeServer() {
      return new Promise<void>(function waitForClose(resolveClose, rejectClose) {
        server.close(function handleClose(error) {
          void vite.close();

          if (error) {
            rejectClose(error);
            return;
          }

          resolveClose();
        });
      });
    },
  };
}

async function handleDevRequest(
  projectRoot: string,
  htmlFile: string,
  vite: ViteDevServer,
  port: number,
  nodeRequest: IncomingMessage,
  nodeResponse: ServerResponse,
): Promise<void> {
  try {
    const request = createWebRequest(nodeRequest, port);
    const proxyResult = await dispatchProxyRequest(request, createDevProxy(projectRoot, vite));

    if (proxyResult.kind === "response") {
      await writeWebResponse(nodeResponse, proxyResult.response);
      return;
    }

    const frameworkResponse = await tryHandleFrameworkRequest(
      projectRoot,
      vite,
      proxyResult.request,
    );

    if (frameworkResponse) {
      await writeWebResponse(
        nodeResponse,
        mergeResponseHeaders(frameworkResponse, proxyResult.responseHeaders),
      );
      return;
    }

    const url = new URL(proxyResult.request.url);

    if (shouldUseViteMiddleware(url.pathname)) {
      const restoreProxyHeaderOverride = installNodeResponseHeaderOverride(
        nodeResponse,
        proxyResult.responseHeaders,
      );

      let handled = false;

      try {
        handled = await runViteMiddleware(vite, nodeRequest, nodeResponse, proxyResult.request);
      } finally {
        restoreProxyHeaderOverride();
      }

      if (handled) {
        return;
      }

      applyHeadersToNodeResponse(nodeResponse, proxyResult.responseHeaders);
      nodeResponse.statusCode = 404;
      nodeResponse.end("Not Found");
      return;
    }

    const html = await readFile(htmlFile, "utf8");
    const transformed = await vite.transformIndexHtml(url.pathname, html);
    await writeWebResponse(
      nodeResponse,
      mergeResponseHeaders(
        new Response(transformed, {
          headers: {
            "content-type": "text/html; charset=utf-8",
          },
        }),
        proxyResult.responseHeaders,
      ),
    );
  } catch (error) {
    vite.ssrFixStacktrace(error as Error);
    await writeWebResponse(nodeResponse, createServerErrorResponse(error));
  }
}

async function tryHandleFrameworkRequest(
  projectRoot: string,
  vite: ViteDevServer,
  request: Request,
): Promise<Response | undefined> {
  const apiResponse = await dispatchApiRequest(request, createDevApiRoutes(projectRoot, vite));

  if (apiResponse) {
    return apiResponse;
  }

  return undefined;
}

function createDevApiRoutes(projectRoot: string, vite: ViteDevServer): RuntimeApiRoute[] {
  return scanApiRoutes(projectRoot).map(function mapRoute(route) {
    return {
      ...route,
      load: function loadRouteModule(): Promise<ApiRouteModule> {
        return vite.ssrLoadModule(route.filePath) as Promise<ApiRouteModule>;
      },
    };
  });
}

function createDevProxy(projectRoot: string, vite: ViteDevServer): RuntimeProxy | undefined {
  const filePath = findProxyFile(projectRoot);

  if (!filePath) {
    return undefined;
  }

  return {
    filePath,
    load: function loadProxyModule(): Promise<ProxyModule> {
      return vite.ssrLoadModule(filePath) as Promise<ProxyModule>;
    },
  };
}

function shouldUseViteMiddleware(pathname: string): boolean {
  return (
    pathname.startsWith("/@vite") ||
    pathname.startsWith("/@react-refresh") ||
    pathname.startsWith("/@id") ||
    pathname.startsWith("/@fs") ||
    pathname.startsWith("/node_modules") ||
    pathname.startsWith("/.now") ||
    Boolean(extname(pathname)) ||
    existsSync(pathname)
  );
}

function runViteMiddleware(
  vite: ViteDevServer,
  request: IncomingMessage,
  response: ServerResponse,
  webRequest: Request,
): Promise<boolean> {
  const originalUrl = request.url;
  request.url = toNodeRequestUrl(webRequest);

  return new Promise<boolean>(function waitForMiddleware(resolveMiddleware, rejectMiddleware) {
    response.on("error", rejectMiddleware);
    vite.middlewares(request, response, function handleNext(error?: unknown) {
      request.url = originalUrl;

      if (error) {
        rejectMiddleware(error);
        return;
      }

      resolveMiddleware(response.writableEnded);
    });
  });
}

function toNodeRequestUrl(request: Request): string {
  const url = new URL(request.url);

  return `${url.pathname}${url.search}`;
}
