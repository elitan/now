import { matchRoute } from "../routing/matcher";
import type { ApiRouteFile, RouteParams } from "../routing/types";

export const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;

export type HttpMethod = (typeof HTTP_METHODS)[number];

export interface ApiRouteContext {
  params: RouteParams;
}

export type ApiRouteHandler = (
  request: Request,
  context: ApiRouteContext,
) => Response | Promise<Response> | unknown | Promise<unknown>;

export type ApiRouteModule = Partial<Record<HttpMethod, ApiRouteHandler>>;

export interface RuntimeApiRoute extends ApiRouteFile {
  load: () => Promise<ApiRouteModule>;
}

export async function dispatchApiRequest(
  request: Request,
  routes: RuntimeApiRoute[],
): Promise<Response | undefined> {
  const url = new URL(request.url);
  const match = matchRoute(routes, url.pathname);

  if (!match) {
    return undefined;
  }

  const module = await match.route.load();
  const method = request.method.toUpperCase() as HttpMethod;
  const handler = module[method];

  if (!handler) {
    return createMethodNotAllowedResponse(module);
  }

  const value = await handler(request, {
    params: match.params,
  });

  if (method === "HEAD") {
    const response = toResponse(value);
    return new Response(null, response);
  }

  return toResponse(value);
}

function createMethodNotAllowedResponse(module: ApiRouteModule): Response {
  const allowed = HTTP_METHODS.filter(function filterMethod(method) {
    return Boolean(module[method]);
  });

  return new Response("Method Not Allowed", {
    status: 405,
    headers: {
      allow: allowed.join(", "),
    },
  });
}

function toResponse(value: unknown): Response {
  if (value instanceof Response) {
    return value;
  }

  if (value === undefined || value === null) {
    return new Response(null, {
      status: 204,
    });
  }

  if (typeof value === "string") {
    return new Response(value, {
      headers: {
        "content-type": "text/plain; charset=utf-8",
      },
    });
  }

  return Response.json(value);
}
