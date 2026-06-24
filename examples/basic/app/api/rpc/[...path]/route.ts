import type { ApiRouteContext } from "next2/server";

export function ALL(request: Request, context: ApiRouteContext): Response {
  const url = new URL(request.url);

  return Response.json({
    rpc: true,
    path: url.pathname,
    params: context.params.path,
  });
}
