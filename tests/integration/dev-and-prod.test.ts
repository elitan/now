import { readFile } from "node:fs/promises";
import { afterAll, describe, expect, it } from "vitest";
import { join, resolve } from "node:path";
import type { ServerBuildManifest } from "../../src/routing/types";
import { buildProject } from "../../src/server/build";
import { startDevServer } from "../../src/server/dev";
import { createProductionFetchHandler } from "../../src/server/prod";

const exampleRoot = resolve("examples/basic");

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
    expect(filesJson.path).toEqual([]);
    expect(groupedJson).toEqual({
      grouped: true,
      runtime: "server",
    });
    expect(pageText).toContain('<div id="root"></div>');
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
    const pageResponse = await handler(new Request("http://test.local/docs/a/b"));
    const docsBaseResponse = await handler(new Request("http://test.local/docs"));
    const pageText = await pageResponse.text();
    const docsBaseText = await docsBaseResponse.text();

    expect(apiJson.id).toBe("123");
    expect(filesRoute?.segments.at(-1)).toEqual({
      kind: "optionalCatchAll",
      value: "[[...path]]",
      param: "path",
    });
    expect(groupedJson).toEqual({
      grouped: true,
      runtime: "server",
    });
    expect(rpcJson).toEqual({
      rpc: true,
      path: "/api/rpc/hello",
      params: ["hello"],
    });
    expect(pageText).toContain('<div id="root"></div>');
    expect(docsBaseText).toContain('<div id="root"></div>');
    expect(join(exampleRoot, "dist", "server")).toContain("dist/server");
  });
});
