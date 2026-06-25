import { describe, expect, expectTypeOf, it } from "vitest";
import { parseRouteSegments } from "../../src/routing/segments";
import {
  type ApiRouteContext,
  dispatchApiRequest,
  type ApiRouteModule,
  type RuntimeApiRoute,
} from "../../src/server/api";

interface TestRouteOptions {
  id: string;
  routePath: string;
  rawSegments: string[];
  module: ApiRouteModule;
}

function createRuntimeRoute(options: TestRouteOptions): RuntimeApiRoute {
  return {
    id: options.id,
    routePath: options.routePath,
    filePath: "memory",
    segments: parseRouteSegments(options.rawSegments),
    load: async function loadModule() {
      return options.module;
    },
  };
}

describe("API dispatch", function apiDispatchSuite() {
  it("dispatches method exports with dynamic params", async function dispatchDynamicRoute() {
    const routes: RuntimeApiRoute[] = [
      createRuntimeRoute({
        id: "api-users-id-route",
        routePath: "/api/users/:id",
        rawSegments: ["api", "users", "[id]"],
        module: {
          GET: function GET(_request, context) {
            return Response.json({
              id: context.params.id,
            });
          },
        },
      }),
    ];

    const response = await dispatchApiRequest(
      new Request("http://test.local/api/users/42"),
      routes,
    );
    const json = (await response?.json()) as { id: string };

    expect(json.id).toBe("42");
  });

  it("returns 405 for unsupported methods", async function unsupportedMethod() {
    const routes: RuntimeApiRoute[] = [
      createRuntimeRoute({
        id: "api-health-route",
        routePath: "/api/health",
        rawSegments: ["api", "health"],
        module: {
          GET: function GET() {
            return Response.json({ ok: true });
          },
        },
      }),
    ];

    const response = await dispatchApiRequest(
      new Request("http://test.local/api/health", {
        method: "POST",
      }),
      routes,
    );

    expect(response?.status).toBe(405);
    expect(response?.headers.get("allow")).toBe("GET, HEAD, OPTIONS");
  });

  it("dispatches HEAD to GET without a response body", async function dispatchHeadFromGet() {
    const routes: RuntimeApiRoute[] = [
      createRuntimeRoute({
        id: "api-health-route",
        routePath: "/api/health",
        rawSegments: ["api", "health"],
        module: {
          GET: function GET() {
            return new Response("visible to GET", {
              status: 201,
              headers: {
                "x-api-route": "health",
              },
            });
          },
        },
      }),
    ];

    const response = await dispatchApiRequest(
      new Request("http://test.local/api/health", {
        method: "HEAD",
      }),
      routes,
    );

    expect(response?.status).toBe(201);
    expect(response?.headers.get("x-api-route")).toBe("health");
    expect(await response?.text()).toBe("");
  });

  it("creates OPTIONS responses from supported route methods", async function automaticOptions() {
    const routes: RuntimeApiRoute[] = [
      createRuntimeRoute({
        id: "api-users-route",
        routePath: "/api/users",
        rawSegments: ["api", "users"],
        module: {
          GET: function GET() {
            return Response.json({ ok: true });
          },
          POST: function POST() {
            return Response.json({ ok: true });
          },
        },
      }),
    ];

    const response = await dispatchApiRequest(
      new Request("http://test.local/api/users", {
        method: "OPTIONS",
      }),
      routes,
    );

    expect(response?.status).toBe(204);
    expect(response?.headers.get("allow")).toBe("GET, POST, HEAD, OPTIONS");
    expect(await response?.text()).toBe("");
  });

  it("prefers explicit OPTIONS exports", async function explicitOptions() {
    const routes: RuntimeApiRoute[] = [
      createRuntimeRoute({
        id: "api-health-route",
        routePath: "/api/health",
        rawSegments: ["api", "health"],
        module: {
          GET: function GET() {
            return Response.json({ ok: true });
          },
          OPTIONS: function OPTIONS() {
            return new Response("custom", {
              status: 200,
              headers: {
                allow: "GET, OPTIONS",
              },
            });
          },
        },
      }),
    ];

    const response = await dispatchApiRequest(
      new Request("http://test.local/api/health", {
        method: "OPTIONS",
      }),
      routes,
    );

    expect(response?.status).toBe(200);
    expect(response?.headers.get("allow")).toBe("GET, OPTIONS");
    expect(await response?.text()).toBe("custom");
  });

  it("dispatches catch-all API params", async function dispatchCatchAllRoute() {
    const routes: RuntimeApiRoute[] = [
      createRuntimeRoute({
        id: "api-files-path-route",
        routePath: "/api/files/*path",
        rawSegments: ["api", "files", "[...path]"],
        module: {
          GET: function GET(_request, context) {
            return Response.json({
              path: context.params.path,
            });
          },
        },
      }),
    ];

    const response = await dispatchApiRequest(
      new Request("http://test.local/api/files/a/b/c"),
      routes,
    );
    const json = (await response?.json()) as { path: string[] };

    expect(json.path).toEqual(["a", "b", "c"]);
  });

  it("dispatches optional catch-all API params", async function dispatchOptionalCatchAllRoute() {
    const routes: RuntimeApiRoute[] = [
      createRuntimeRoute({
        id: "api-files-optional-catch-all-path-route",
        routePath: "/api/files/*path?",
        rawSegments: ["api", "files", "[[...path]]"],
        module: {
          GET: function GET(_request, context) {
            return Response.json({
              path: context.params.path,
            });
          },
        },
      }),
    ];

    const baseResponse = await dispatchApiRequest(
      new Request("http://test.local/api/files"),
      routes,
    );
    const nestedResponse = await dispatchApiRequest(
      new Request("http://test.local/api/files/a/b/c"),
      routes,
    );
    const baseJson = (await baseResponse?.json()) as { path: string[] };
    const nestedJson = (await nestedResponse?.json()) as { path: string[] };

    expect(baseJson.path).toEqual([]);
    expect(nestedJson.path).toEqual(["a", "b", "c"]);
  });

  it("normalizes optional catch-all API paths", async function normalizeOptionalCatchAllRoute() {
    const routes: RuntimeApiRoute[] = [
      createRuntimeRoute({
        id: "api-files-optional-catch-all-path-route",
        routePath: "/api/files/*path?",
        rawSegments: ["api", "files", "[[...path]]"],
        module: {
          GET: function GET(_request, context) {
            return Response.json({
              path: context.params.path,
            });
          },
        },
      }),
    ];

    const baseResponse = await dispatchApiRequest(
      new Request("http://test.local/api/files/?download=true"),
      routes,
    );
    const nestedResponse = await dispatchApiRequest(
      new Request("http://test.local/api/files/a%20b/%E2%9C%93/"),
      routes,
    );
    const baseJson = (await baseResponse?.json()) as { path: string[] };
    const nestedJson = (await nestedResponse?.json()) as { path: string[] };

    expect(baseJson.path).toEqual([]);
    expect(nestedJson.path).toEqual(["a b", "\u2713"]);
  });

  it("keeps optional catch-all API routes behind specific routes", async function apiPrecedence() {
    const routes: RuntimeApiRoute[] = [
      createRuntimeRoute({
        id: "optional",
        routePath: "/api/files/*path?",
        rawSegments: ["api", "files", "[[...path]]"],
        module: {
          GET: function GET(_request, context) {
            return Response.json({
              route: "optional",
              path: context.params.path,
            });
          },
        },
      }),
      createRuntimeRoute({
        id: "catch-all",
        routePath: "/api/files/*path",
        rawSegments: ["api", "files", "[...path]"],
        module: {
          GET: function GET(_request, context) {
            return Response.json({
              route: "catch-all",
              path: context.params.path,
            });
          },
        },
      }),
      createRuntimeRoute({
        id: "dynamic",
        routePath: "/api/files/:id",
        rawSegments: ["api", "files", "[id]"],
        module: {
          GET: function GET(_request, context) {
            return Response.json({
              route: "dynamic",
              id: context.params.id,
            });
          },
        },
      }),
      createRuntimeRoute({
        id: "static",
        routePath: "/api/files/meta",
        rawSegments: ["api", "files", "meta"],
        module: {
          GET: function GET() {
            return Response.json({
              route: "static",
            });
          },
        },
      }),
    ];

    const baseResponse = await dispatchApiRequest(
      new Request("http://test.local/api/files"),
      routes,
    );
    const staticResponse = await dispatchApiRequest(
      new Request("http://test.local/api/files/meta"),
      routes,
    );
    const dynamicResponse = await dispatchApiRequest(
      new Request("http://test.local/api/files/42"),
      routes,
    );
    const catchAllResponse = await dispatchApiRequest(
      new Request("http://test.local/api/files/a/b"),
      routes,
    );

    expect(await baseResponse?.json()).toEqual({
      route: "optional",
      path: [],
    });
    expect(await staticResponse?.json()).toEqual({
      route: "static",
    });
    expect(await dynamicResponse?.json()).toEqual({
      route: "dynamic",
      id: "42",
    });
    expect(await catchAllResponse?.json()).toEqual({
      route: "catch-all",
      path: ["a", "b"],
    });
  });

  it("uses ALL as an app/api fallback for RPC-style handlers", async function dispatchAllRoute() {
    const routes: RuntimeApiRoute[] = [
      createRuntimeRoute({
        id: "api-rpc-path-route",
        routePath: "/api/rpc/*path",
        rawSegments: ["api", "rpc", "[...path]"],
        module: {
          ALL: function ALL(request, context) {
            return Response.json({
              method: request.method,
              path: context.params.path,
            });
          },
        },
      }),
    ];

    const response = await dispatchApiRequest(
      new Request("http://test.local/api/rpc/posts/list", {
        method: "POST",
      }),
      routes,
    );
    const json = (await response?.json()) as { method: string; path: string[] };

    expect(json).toEqual({
      method: "POST",
      path: ["posts", "list"],
    });
  });

  it("keeps ALL as the fallback for OPTIONS requests", async function dispatchAllOptionsRoute() {
    const routes: RuntimeApiRoute[] = [
      createRuntimeRoute({
        id: "api-rpc-path-route",
        routePath: "/api/rpc/*path",
        rawSegments: ["api", "rpc", "[...path]"],
        module: {
          ALL: function ALL(request, context) {
            return Response.json({
              method: request.method,
              path: context.params.path,
            });
          },
        },
      }),
    ];

    const response = await dispatchApiRequest(
      new Request("http://test.local/api/rpc/posts/list", {
        method: "OPTIONS",
      }),
      routes,
    );
    const json = (await response?.json()) as { method: string; path: string[] };

    expect(json).toEqual({
      method: "OPTIONS",
      path: ["posts", "list"],
    });
  });

  it("types route context params from route literals", function apiContextTypes() {
    expectTypeOf<ApiRouteContext<"/api/users/[id]">["params"]>().toEqualTypeOf<{
      id: string;
    }>();
    expectTypeOf<ApiRouteContext<"/api/files/[...path]">["params"]>().toEqualTypeOf<{
      path: string[];
    }>();
    expectTypeOf<ApiRouteContext<"/api/files/[[...path]]">["params"]>().toEqualTypeOf<{
      path: string[];
    }>();
  });
});
