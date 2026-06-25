import type { ApiRouteContext } from "now/server";

export function GET(_request: Request, context: ApiRouteContext<"/api/files/[...path]">): Response {
  return Response.json({
    path: context.params.path,
  });
}
