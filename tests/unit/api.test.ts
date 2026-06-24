import { describe, expect, it } from "vitest";
import { parseRouteSegments } from "../../src/routing/segments";
import { dispatchApiRequest, type RuntimeApiRoute } from "../../src/server/api";

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
    expect(response?.headers.get("allow")).toBe("GET");
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
});
