import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, resolve } from "node:path";
import { createServer as createViteServer, type ViteDevServer } from "vite";
import { scanApiRoutes } from "../routing/scanner";
import { writeGeneratedClientFiles } from "../vite/generated";
import type { ApiRouteModule, RuntimeApiRoute } from "./api";
import { dispatchApiRequest } from "./api";
import { createWebRequest, type RunningServer, writeWebResponse } from "./http";
import type { StartOptions } from "./prod";
import { createViteConfig, resolveNext2RuntimePaths } from "./vite-config";

export async function startDevServer(
  projectRoot: string,
  options: StartOptions = {},
): Promise<RunningServer> {
  const root = resolve(projectRoot);
  const port = options.port ?? 3000;
  const hostname = options.hostname ?? "127.0.0.1";
  const runtime = resolveNext2RuntimePaths();
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
    const frameworkResponse = await tryHandleFrameworkRequest(projectRoot, vite, request);

    if (frameworkResponse) {
      await writeWebResponse(nodeResponse, frameworkResponse);
      return;
    }

    const url = new URL(request.url);

    if (shouldUseViteMiddleware(url.pathname)) {
      const handled = await runViteMiddleware(vite, nodeRequest, nodeResponse);

      if (handled) {
        return;
      }

      nodeResponse.statusCode = 404;
      nodeResponse.end("Not Found");
      return;
    }

    const html = await readFile(htmlFile, "utf8");
    const transformed = await vite.transformIndexHtml(url.pathname, html);
    await writeWebResponse(
      nodeResponse,
      new Response(transformed, {
        headers: {
          "content-type": "text/html; charset=utf-8",
        },
      }),
    );
  } catch (error) {
    vite.ssrFixStacktrace(error as Error);
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
    await writeWebResponse(
      nodeResponse,
      new Response(message, {
        status: 500,
        headers: {
          "content-type": "text/plain; charset=utf-8",
        },
      }),
    );
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

function shouldUseViteMiddleware(pathname: string): boolean {
  return (
    pathname.startsWith("/@vite") ||
    pathname.startsWith("/@react-refresh") ||
    pathname.startsWith("/@id") ||
    pathname.startsWith("/@fs") ||
    pathname.startsWith("/node_modules") ||
    pathname.startsWith("/.next2") ||
    Boolean(extname(pathname)) ||
    existsSync(pathname)
  );
}

function runViteMiddleware(
  vite: ViteDevServer,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<boolean> {
  return new Promise<boolean>(function waitForMiddleware(resolveMiddleware, rejectMiddleware) {
    response.on("error", rejectMiddleware);
    vite.middlewares(request, response, function handleNext(error?: unknown) {
      if (error) {
        rejectMiddleware(error);
        return;
      }

      resolveMiddleware(response.writableEnded);
    });
  });
}
