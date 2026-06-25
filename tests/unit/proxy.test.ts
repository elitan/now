import { describe, expect, it } from "vitest";
import {
  dispatchProxyRequest,
  next,
  redirect,
  rewrite,
  type RuntimeProxy,
} from "../../src/server/proxy";
import { mergeResponseHeaders } from "../../src/server/headers";

function createProxy(handler: RuntimeProxy["load"]): RuntimeProxy {
  return {
    filePath: "proxy.ts",
    load: handler,
  };
}

describe("proxy dispatch", function proxyDispatchSuite() {
  it("forwards unchanged when no proxy exists", async function noProxy() {
    const request = new Request("http://test.local/about");
    const result = await dispatchProxyRequest(request, undefined);

    expect(result.kind).toBe("forward");

    if (result.kind === "forward") {
      expect(result.request).toBe(request);
      expect(Array.from(result.responseHeaders.entries())).toEqual([]);
    }
  });

  it("returns direct proxy responses", async function directResponse() {
    const result = await dispatchProxyRequest(
      new Request("http://test.local/about"),
      createProxy(async function loadProxy() {
        return {
          proxy: function proxy() {
            return new Response("from proxy", {
              status: 201,
            });
          },
        };
      }),
    );

    expect(result.kind).toBe("response");

    if (result.kind === "response") {
      expect(result.response.status).toBe(201);
      expect(await result.response.text()).toBe("from proxy");
    }
  });

  it("does not treat normal response headers as proxy control metadata", async function directHeaderCollision() {
    const result = await dispatchProxyRequest(
      new Request("http://test.local/about"),
      createProxy(async function loadProxy() {
        return {
          proxy: function proxy() {
            return new Response("from proxy", {
              headers: {
                "x-now-internal-proxy-action": "rewrite",
              },
            });
          },
        };
      }),
    );

    expect(result.kind).toBe("response");

    if (result.kind === "response") {
      expect(result.response.headers.get("x-now-internal-proxy-action")).toBe("rewrite");
      expect(await result.response.text()).toBe("from proxy");
    }
  });

  it("supports next responses with request and response headers", async function nextResponse() {
    const result = await dispatchProxyRequest(
      new Request("http://test.local/api/data", {
        headers: {
          "x-original": "true",
        },
      }),
      createProxy(async function loadProxy() {
        return {
          proxy: function proxy(request) {
            const headers = new Headers(request.headers);
            headers.set("x-from-proxy", "next");

            const response = next({
              request: {
                headers,
              },
            });
            response.headers.set("x-proxy-response", "next");

            return response;
          },
        };
      }),
    );

    expect(result.kind).toBe("forward");
    expect(next().headers.has("x-now-internal-proxy-action")).toBe(false);

    if (result.kind === "forward") {
      expect(result.request.url).toBe("http://test.local/api/data");
      expect(result.request.headers.get("x-original")).toBe("true");
      expect(result.request.headers.get("x-from-proxy")).toBe("next");
      expect(result.responseHeaders.get("x-proxy-response")).toBe("next");
    }
  });

  it("supports rewrites with response headers", async function rewriteResponse() {
    const result = await dispatchProxyRequest(
      new Request("http://test.local/old?q=1"),
      createProxy(async function loadProxy() {
        return {
          default: function proxy() {
            const response = rewrite("/new?q=2");
            response.headers.set("x-proxy-response", "rewrite");

            return response;
          },
        };
      }),
    );

    expect(result.kind).toBe("forward");

    if (result.kind === "forward") {
      expect(result.request.url).toBe("http://test.local/new?q=2");
      expect(result.responseHeaders.get("x-proxy-response")).toBe("rewrite");
    }
  });

  it("merges proxy headers onto downstream responses", function mergeHeaders() {
    const proxyHeaders = new Headers({
      "x-proxy": "true",
    });
    const response = mergeResponseHeaders(
      new Response("ok", {
        headers: {
          "content-type": "text/plain",
        },
      }),
      proxyHeaders,
    );

    expect(response.headers.get("content-type")).toBe("text/plain");
    expect(response.headers.get("x-proxy")).toBe("true");
  });

  it("creates redirect responses", function redirectResponse() {
    const response = redirect("/login", 308);

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("/login");
  });
});
