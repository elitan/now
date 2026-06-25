import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { mergeResponseHeaders } from "./headers";

const PROXY_FILE = "proxy.ts";
const PROXY_METADATA = Symbol.for("now.proxy.metadata");

type ProxyAction = "next" | "rewrite";

interface ProxyMetadata {
  action: ProxyAction;
  destination?: string;
  requestHeaders?: Headers;
}

type ProxyControlResponse = Response & {
  [PROXY_METADATA]?: ProxyMetadata;
};

export interface ProxyForwardOptions {
  headers?: HeadersInit;
  request?: {
    headers?: HeadersInit;
  };
}

export type ProxyRedirectStatus = 301 | 302 | 303 | 307 | 308;
export type ProxyHandlerResult = Response | undefined | null;

export type ProxyHandler = (request: Request) => ProxyHandlerResult | Promise<ProxyHandlerResult>;

export interface ProxyModule {
  default?: ProxyHandler;
  proxy?: ProxyHandler;
}

export interface RuntimeProxy {
  filePath: string;
  load: () => Promise<ProxyModule>;
}

export type ProxyDispatchResult =
  | {
      kind: "forward";
      request: Request;
      responseHeaders: Headers;
    }
  | {
      kind: "response";
      response: Response;
    };

export type DownstreamHandler = (request: Request) => Promise<Response>;

export function findProxyFile(projectRoot: string): string | undefined {
  const file = resolve(projectRoot, PROXY_FILE);

  if (!existsSync(file)) {
    return undefined;
  }

  return file;
}

export async function dispatchProxyRequest(
  request: Request,
  proxy: RuntimeProxy | undefined,
): Promise<ProxyDispatchResult> {
  if (!proxy) {
    return createForwardResult(request, new Headers());
  }

  const module = await proxy.load();
  const handler = resolveProxyHandler(module, proxy.filePath);
  const value = await handler(request);

  return resolveProxyValue(request, value);
}

export async function handleProxyRequest(
  request: Request,
  proxy: RuntimeProxy | undefined,
  downstream: DownstreamHandler,
): Promise<Response> {
  const proxyResult = await dispatchProxyRequest(request, proxy);

  if (proxyResult.kind === "response") {
    return proxyResult.response;
  }

  return mergeResponseHeaders(await downstream(proxyResult.request), proxyResult.responseHeaders);
}

export function next(options: ProxyForwardOptions = {}): Response {
  return createControlResponse("next", undefined, options);
}

export function rewrite(destination: string | URL, options: ProxyForwardOptions = {}): Response {
  return createControlResponse("rewrite", String(destination), options);
}

export function redirect(destination: string | URL, status: ProxyRedirectStatus = 307): Response {
  return new Response(null, {
    status,
    headers: {
      location: String(destination),
    },
  });
}

function resolveProxyHandler(module: ProxyModule, filePath: string): ProxyHandler {
  const handler = module.proxy ?? module.default;

  if (typeof handler !== "function") {
    throw new Error(`${filePath} must export a proxy function or default function.`);
  }

  return handler;
}

function resolveProxyValue(
  request: Request,
  value: Response | undefined | null,
): ProxyDispatchResult {
  if (value === undefined || value === null) {
    return createForwardResult(request, new Headers());
  }

  const metadata = readProxyMetadata(value);

  if (!metadata) {
    return {
      kind: "response",
      response: value,
    };
  }

  const headers = new Headers(value.headers);

  if (metadata.action === "next") {
    return createForwardResult(createForwardedRequest(request, request.url, metadata), headers);
  }

  if (!metadata.destination) {
    throw new Error("Proxy rewrite responses must include a destination URL.");
  }

  return createForwardResult(
    createForwardedRequest(request, new URL(metadata.destination, request.url).href, metadata),
    headers,
  );
}

function createForwardResult(request: Request, responseHeaders: Headers): ProxyDispatchResult {
  return {
    kind: "forward",
    request,
    responseHeaders,
  };
}

function createControlResponse(
  action: ProxyAction,
  destination: string | undefined,
  options: ProxyForwardOptions,
): Response {
  const init: ResponseInit = {
    status: 204,
  };
  const metadata: ProxyMetadata = {
    action,
  };

  if (options.headers) {
    init.headers = options.headers;
  }

  if (destination !== undefined) {
    metadata.destination = destination;
  }

  if (options.request?.headers) {
    metadata.requestHeaders = new Headers(options.request.headers);
  }

  const response = new Response(null, init);

  return attachProxyMetadata(response, metadata);
}

function createForwardedRequest(request: Request, url: string, metadata: ProxyMetadata): Request {
  const requestHeaders = metadata.requestHeaders ?? request.headers;
  const hasUrlChange = url !== request.url;
  const hasHeaderChange = Boolean(metadata.requestHeaders);

  if (!hasUrlChange && !hasHeaderChange) {
    return request;
  }

  const init: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers: requestHeaders,
    cache: request.cache,
    credentials: request.credentials,
    integrity: request.integrity,
    keepalive: request.keepalive,
    mode: request.mode,
    redirect: request.redirect,
    referrer: request.referrer,
    referrerPolicy: request.referrerPolicy,
    signal: request.signal,
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;

    if (request.body) {
      init.duplex = "half";
    }
  }

  return new Request(url, init);
}

function attachProxyMetadata(response: Response, metadata: ProxyMetadata): Response {
  Object.defineProperty(response, PROXY_METADATA, {
    configurable: false,
    enumerable: false,
    value: metadata,
    writable: false,
  });

  return response;
}

function readProxyMetadata(response: Response): ProxyMetadata | undefined {
  return (response as ProxyControlResponse)[PROXY_METADATA];
}
