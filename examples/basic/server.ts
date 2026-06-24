import { defineServer } from "next2/server";

export default defineServer(function configure(server) {
  server.mount("/rpc", async function handleRpc(request) {
    const url = new URL(request.url);

    return Response.json({
      rpc: true,
      path: url.pathname,
    });
  });
});
