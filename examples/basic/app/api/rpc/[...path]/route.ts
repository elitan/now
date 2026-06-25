import type { ApiRouteContext } from "now/server";

export function ALL(request: Request, context: ApiRouteContext<"/api/rpc/[...path]">): Response {
  const url = new URL(request.url);

  return Response.json({
    rpc: true,
    path: url.pathname,
    params: context.params.path,
  });
}
