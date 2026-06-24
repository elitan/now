import { describe, expect, it } from "vitest";
import { defineServer } from "../../src/server";
import { dispatchMountRequest } from "../../src/server/mounts";

describe("server mounts", function serverMountSuite() {
  it("mounts RPC-agnostic fetch handlers by path prefix", async function dispatchMount() {
    const module = defineServer(function configure(server) {
      server.mount("/rpc", function handleRpc(request) {
        const url = new URL(request.url);

        return Response.json({
          path: url.pathname,
        });
      });
    });

    const mounts: ReturnType<typeof module.setup> extends Promise<void> ? never : never =
      undefined as never;
    void mounts;

    const server = new (await import("../../src/server")).ServerApp();
    await module.setup(server);

    const response = await dispatchMountRequest(
      new Request("http://test.local/rpc/hello"),
      server.getMounts(),
    );
    const json = (await response?.json()) as { path: string };

    expect(json.path).toBe("/rpc/hello");
  });
});
