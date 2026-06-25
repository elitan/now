import { describe, expect, expectTypeOf, it } from "vitest";
import { parseRouteSegments } from "../../src/routing/segments";
import {
  type ApiRouteContext,
  dispatchApiRequest,
  type RuntimeApiRoute,
} from "../../src/server/api";

describe("API dispatch", function apiDispatchSuite() {
  it("dispatches method exports with dynamic params", async function dispatchDynamicRoute() {
    const routes: RuntimeApiRoute[] = [
      {
        id: "api-users-id-route",
        routePath: "/api/users/:id",
        filePath: "memory",
        segments: parseRouteSegments(["api", "users", "[id]"]),
        load: async function loadModule() {
          return {
            GET: function GET(_request, context) {
              return Response.json({
                id: context.params.id,
              });
            },
          };
        },
      },
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
      {
        id: "api-health-route",
        routePath: "/api/health",
        filePath: "memory",
        segments: parseRouteSegments(["api", "health"]),
        load: async function loadModule() {
          return {
            GET: function GET() {
              return Response.json({ ok: true });
            },
          };
        },
      },
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
      {
        id: "api-health-route",
        routePath: "/api/health",
        filePath: "memory",
        segments: parseRouteSegments(["api", "health"]),
        load: async function loadModule() {
          return {
            GET: function GET() {
              return new Response("visible to GET", {
                status: 201,
                headers: {
                  "x-api-route": "health",
                },
              });
            },
          };
        },
      },
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
      {
        id: "api-users-route",
        routePath: "/api/users",
        filePath: "memory",
        segments: parseRouteSegments(["api", "users"]),
        load: async function loadModule() {
          return {
            GET: function GET() {
              return Response.json({ ok: true });
            },
            POST: function POST() {
              return Response.json({ ok: true });
            },
          };
        },
      },
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
      {
        id: "api-health-route",
        routePath: "/api/health",
        filePath: "memory",
        segments: parseRouteSegments(["api", "health"]),
        load: async function loadModule() {
          return {
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
          };
        },
      },
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
      {
        id: "api-files-path-route",
        routePath: "/api/files/*path",
        filePath: "memory",
        segments: parseRouteSegments(["api", "files", "[...path]"]),
        load: async function loadModule() {
          return {
            GET: function GET(_request, context) {
              return Response.json({
                path: context.params.path,
              });
            },
          };
        },
      },
    ];

    const response = await dispatchApiRequest(
      new Request("http://test.local/api/files/a/b/c"),
      routes,
    );
    const json = (await response?.json()) as { path: string[] };

    expect(json.path).toEqual(["a", "b", "c"]);
  });

  it("uses ALL as an app/api fallback for RPC-style handlers", async function dispatchAllRoute() {
    const routes: RuntimeApiRoute[] = [
      {
        id: "api-rpc-path-route",
        routePath: "/api/rpc/*path",
        filePath: "memory",
        segments: parseRouteSegments(["api", "rpc", "[...path]"]),
        load: async function loadModule() {
          return {
            ALL: function ALL(request, context) {
              return Response.json({
                method: request.method,
                path: context.params.path,
              });
            },
          };
        },
      },
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
      {
        id: "api-rpc-path-route",
        routePath: "/api/rpc/*path",
        filePath: "memory",
        segments: parseRouteSegments(["api", "rpc", "[...path]"]),
        load: async function loadModule() {
          return {
            ALL: function ALL(request, context) {
              return Response.json({
                method: request.method,
                path: context.params.path,
              });
            },
          };
        },
      },
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
      path?: string[];
    }>();
  });
});
