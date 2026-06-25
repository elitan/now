import { readFile } from "node:fs/promises";
import { afterAll, describe, expect, it } from "vitest";
import { join, resolve } from "node:path";
import type { ServerBuildManifest } from "../../src/routing/types";
import { buildProject } from "../../src/server/build";
import { startDevServer } from "../../src/server/dev";
import { createProductionFetchHandler } from "../../src/server/prod";

const exampleRoot = resolve("examples/basic");

interface TestClient {
  request(path: string, init?: RequestInit): Promise<Response>;
}

describe("dev and production flows", function integrationSuite() {
  const closers: Array<() => Promise<void>> = [];

  afterAll(async function closeServers() {
    for (const close of closers) {
      await close();
    }
  });

  it("serves API routes and SPA fallback in dev", async function devFlow() {
    const server = await startDevServer(exampleRoot, {
      port: 0,
    });
    closers.push(server.close);

    const apiResponse = await fetch(`http://127.0.0.1:${server.port}/api/health`);
    const apiJson = (await apiResponse.json()) as { ok: boolean; runtime: string };
    const headResponse = await fetch(`http://127.0.0.1:${server.port}/api/users/123`, {
      method: "HEAD",
    });
    const optionsResponse = await fetch(`http://127.0.0.1:${server.port}/api/users/123`, {
      method: "OPTIONS",
    });
    const failureResponse = await fetch(`http://127.0.0.1:${server.port}/api/fail`);
    const failureText = await failureResponse.text();
    const filesResponse = await fetch(`http://127.0.0.1:${server.port}/api/files`);
    const filesJson = (await filesResponse.json()) as { path: string[] };
    const groupedResponse = await fetch(`http://127.0.0.1:${server.port}/api/grouped`);
    const groupedJson = (await groupedResponse.json()) as { grouped: boolean; runtime: string };
    const pageResponse = await fetch(`http://127.0.0.1:${server.port}/about?q=dev`);
    const pageText = await pageResponse.text();

    expect(apiJson).toEqual({
      ok: true,
      runtime: "server",
    });
    expect(headResponse.status).toBe(200);
    expect(await headResponse.text()).toBe("");
    expect(optionsResponse.status).toBe(204);
    expect(optionsResponse.headers.get("allow")).toBe("GET, HEAD, OPTIONS");
    expect(failureResponse.status).toBe(500);
    expect(failureText).toContain("Intentional API route failure");
    expect(filesJson.path).toEqual([]);
    expect(groupedJson).toEqual({
      grouped: true,
      runtime: "server",
    });
    expect(pageText).toContain('<div id="root"></div>');
    await expectProxyBehavior(createDevClient(server.port));
  });

  it("builds and creates a production fetch handler", async function productionFlow() {
    await buildProject(exampleRoot);

    const handler = await createProductionFetchHandler(exampleRoot);
    const manifestText = await readFile(
      join(exampleRoot, "dist", "server", "manifest.json"),
      "utf8",
    );
    const manifest = JSON.parse(manifestText) as ServerBuildManifest;
    const filesRoute = manifest.apiRoutes.find(function findFilesRoute(route) {
      return route.routePath === "/api/files/*path?";
    });
    const apiResponse = await handler(new Request("http://test.local/api/users/123"));
    const apiJson = (await apiResponse.json()) as { id: string };
    const headResponse = await handler(
      new Request("http://test.local/api/users/123", {
        method: "HEAD",
      }),
    );
    const optionsResponse = await handler(
      new Request("http://test.local/api/users/123", {
        method: "OPTIONS",
      }),
    );
    const groupedResponse = await handler(new Request("http://test.local/api/grouped"));
    const groupedJson = (await groupedResponse.json()) as {
      grouped: boolean;
      runtime: string;
    };
    const rpcResponse = await handler(
      new Request("http://test.local/api/rpc/hello", {
        method: "POST",
      }),
    );
    const rpcJson = (await rpcResponse.json()) as {
      rpc: boolean;
      path: string;
      params: string[];
    };
    const failureResponse = await handler(new Request("http://test.local/api/fail"));
    const failureText = await failureResponse.text();
    const pageResponse = await handler(new Request("http://test.local/docs/a/b"));
    const docsBaseResponse = await handler(new Request("http://test.local/docs"));
    const pageText = await pageResponse.text();
    const docsBaseText = await docsBaseResponse.text();

    expect(apiJson.id).toBe("123");
    expect(headResponse.status).toBe(200);
    expect(await headResponse.text()).toBe("");
    expect(optionsResponse.status).toBe(204);
    expect(optionsResponse.headers.get("allow")).toBe("GET, HEAD, OPTIONS");
    expect(filesRoute?.segments.at(-1)).toEqual({
      kind: "optionalCatchAll",
      value: "[[...path]]",
      param: "path",
    });
    expect(manifest.proxy?.modulePath).toBe("proxy.mjs");
    expect(groupedJson).toEqual({
      grouped: true,
      runtime: "server",
    });
    expect(rpcJson).toEqual({
      rpc: true,
      path: "/api/rpc/hello",
      params: ["hello"],
    });
    expect(failureResponse.status).toBe(500);
    expect(failureText).toContain("Intentional API route failure");
    expect(pageText).toContain('<div id="root"></div>');
    expect(docsBaseText).toContain('<div id="root"></div>');
    await expectProxyBehavior(createProductionClient(handler));
    expect(join(exampleRoot, "dist", "server")).toContain("dist/server");
  });
});

function createDevClient(port: number): TestClient {
  return {
    request: function request(path, init) {
      return fetch(`http://127.0.0.1:${port}${path}`, init);
    },
  };
}

function createProductionClient(handler: (request: Request) => Promise<Response>): TestClient {
  return {
    request: function request(path, init) {
      return handler(new Request(`http://test.local${path}`, init));
    },
  };
}

async function expectProxyBehavior(client: TestClient): Promise<void> {
  const directResponse = await client.request("/proxy-direct");
  const directText = await directResponse.text();
  const redirectResponse = await client.request("/proxy-redirect", {
    redirect: "manual",
  });
  const nextApiResponse = await client.request("/api/proxy-header?via=next");
  const nextApiJson = (await nextApiResponse.json()) as { fromProxy: string };
  const rewriteApiResponse = await client.request("/proxy-rewrite-api");
  const rewriteApiJson = (await rewriteApiResponse.json()) as { fromProxy: string };
  const staticResponse = await client.request("/proxy-static.txt");
  const staticText = await staticResponse.text();
  const rewriteStaticResponse = await client.request("/proxy-rewrite-static");
  const rewriteStaticText = await rewriteStaticResponse.text();
  const rewritePageResponse = await client.request("/proxy-rewrite-page");
  const rewritePageText = await rewritePageResponse.text();
  const nextPageResponse = await client.request("/proxy-next-page");
  const nextPageText = await nextPageResponse.text();

  expect(directText).toBe("handled by proxy");
  expect(directResponse.headers.get("x-proxy-direct")).toBe("true");
  expect(redirectResponse.status).toBe(308);
  expect(redirectResponse.headers.get("location")).toBe("/about");
  expect(nextApiJson).toEqual({
    fromProxy: "next-api",
  });
  expect(nextApiResponse.headers.get("x-proxy-next")).toBe("api");
  expect(rewriteApiJson).toEqual({
    fromProxy: "rewrite-api",
  });
  expect(rewriteApiResponse.headers.get("x-proxy-rewrite")).toBe("api");
  expect(staticText).toBe("static through proxy\n");
  expect(staticResponse.headers.get("cache-control")).toBe("proxy-cache");
  expect(staticResponse.headers.get("x-proxy-next")).toBe("static");
  expect(rewriteStaticText).toBe("static through proxy\n");
  expect(rewriteStaticResponse.headers.get("cache-control")).toBe("proxy-cache");
  expect(rewriteStaticResponse.headers.get("x-proxy-rewrite")).toBe("static");
  expect(rewritePageText).toContain('<div id="root"></div>');
  expect(rewritePageResponse.headers.get("x-proxy-rewrite")).toBe("page");
  expect(nextPageText).toContain('<div id="root"></div>');
  expect(nextPageResponse.headers.get("x-proxy-next")).toBe("page");
}
