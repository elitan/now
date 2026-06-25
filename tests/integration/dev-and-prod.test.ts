import { afterAll, describe, expect, it } from "vitest";
import { join, resolve } from "node:path";
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
    const headResponse = await fetch(`http://127.0.0.1:${server.port}/api/users/123`, {
      method: "HEAD",
    });
    const optionsResponse = await fetch(`http://127.0.0.1:${server.port}/api/users/123`, {
      method: "OPTIONS",
    });
    const failureResponse = await fetch(`http://127.0.0.1:${server.port}/api/fail`);
    const failureText = await failureResponse.text();
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
    expect(pageText).toContain('<div id="root"></div>');
  });

  it("builds and creates a production fetch handler", async function productionFlow() {
    await buildProject(exampleRoot);

    const handler = await createProductionFetchHandler(exampleRoot);
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
    const pageText = await pageResponse.text();

    expect(apiJson.id).toBe("123");
    expect(headResponse.status).toBe(200);
    expect(await headResponse.text()).toBe("");
    expect(optionsResponse.status).toBe(204);
    expect(optionsResponse.headers.get("allow")).toBe("GET, HEAD, OPTIONS");
    expect(rpcJson).toEqual({
      rpc: true,
      path: "/api/rpc/hello",
      params: ["hello"],
    });
    expect(failureResponse.status).toBe(500);
    expect(failureText).toContain("Intentional API route failure");
    expect(pageText).toContain('<div id="root"></div>');
    expect(join(exampleRoot, "dist", "server")).toContain("dist/server");
  });
});
