import { matchRoute } from "../routing/matcher";
import type { RouteParamsForPath } from "../routing/segments";
import type { ApiRouteFile, RouteParams } from "../routing/types";

export const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;

export type HttpMethod = (typeof HTTP_METHODS)[number];
export type AnyHttpMethod = "ALL";

export type ApiRouteParams<Path extends string> = RouteParamsForPath<Path>;

export type ApiRouteContext<TPathOrParams = RouteParams> = {
  params: TPathOrParams extends string ? ApiRouteParams<TPathOrParams> : TPathOrParams;
};

export type ApiRouteHandler<TPathOrParams = RouteParams> = (
  request: Request,
  context: ApiRouteContext<TPathOrParams>,
) => Response | Promise<Response> | unknown | Promise<unknown>;

export type ApiRouteModule<TPathOrParams = RouteParams> = Partial<
  Record<HttpMethod | AnyHttpMethod, ApiRouteHandler<TPathOrParams>>
>;

export interface RuntimeApiRoute extends ApiRouteFile {
  load: () => Promise<ApiRouteModule>;
}

type ApiMethodResolution =
  | {
      kind: "handler";
      handler: ApiRouteHandler;
      stripBody: boolean;
    }
  | {
      kind: "response";
      response: Response;
    };

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
  const method = request.method.toUpperCase();
  const resolution = resolveApiMethod(module, method);

  if (resolution.kind === "response") {
    return resolution.response;
  }

  const value = await resolution.handler(request, {
    params: match.params,
  });

  if (resolution.stripBody) {
    const response = toResponse(value);
    return new Response(null, response);
  }

  return toResponse(value);
}

function resolveApiMethod(module: ApiRouteModule, method: string): ApiMethodResolution {
  const allowed = allowedMethods(module);

  if (method === "OPTIONS" && !module.OPTIONS && !module.ALL && allowed.includes("OPTIONS")) {
    return {
      kind: "response",
      response: createOptionsResponse(allowed),
    };
  }

  if (!isHttpMethod(method)) {
    if (module.ALL) {
      return {
        kind: "handler",
        handler: module.ALL,
        stripBody: false,
      };
    }

    return {
      kind: "response",
      response: createMethodNotAllowedResponse(allowed),
    };
  }

  let handler: ApiRouteHandler | undefined;

  if (method === "HEAD") {
    handler = module.HEAD ?? module.GET ?? module.ALL;
  } else {
    handler = module[method] ?? module.ALL;
  }

  if (!handler) {
    return {
      kind: "response",
      response: createMethodNotAllowedResponse(allowed),
    };
  }

  return {
    kind: "handler",
    handler,
    stripBody: method === "HEAD",
  };
}

function createMethodNotAllowedResponse(allowed: HttpMethod[]): Response {
  return new Response("Method Not Allowed", {
    status: 405,
    headers: {
      allow: allowed.join(", "),
    },
  });
}

function createOptionsResponse(allowed: HttpMethod[]): Response {
  return new Response(null, {
    status: 204,
    headers: {
      allow: allowed.join(", "),
    },
  });
}

function allowedMethods(module: ApiRouteModule): HttpMethod[] {
  if (module.ALL) {
    return [...HTTP_METHODS];
  }

  const allowed: HttpMethod[] = [];

  for (const method of HTTP_METHODS) {
    if (method === "HEAD") {
      if (module.HEAD || module.GET) {
        allowed.push(method);
      }
      continue;
    }

    if (method === "OPTIONS") {
      if (module.OPTIONS || allowed.length > 0) {
        allowed.push(method);
      }
      continue;
    }

    if (module[method]) {
      allowed.push(method);
    }
  }

  return allowed;
}

function isHttpMethod(method: string): method is HttpMethod {
  return HTTP_METHODS.some(function matchMethod(httpMethod) {
    return httpMethod === method;
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
