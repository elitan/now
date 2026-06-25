import type { ApiRouteContext } from "now/server";

export function GET(_request: Request, context: ApiRouteContext<"/api/users/[id]">): Response {
  return Response.json({
    id: context.params.id,
  });
}
