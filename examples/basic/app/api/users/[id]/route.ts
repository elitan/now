import type { ApiRouteContext } from "now/server";

export function GET(_request: Request, context: ApiRouteContext): Response {
  return Response.json({
    id: context.params.id,
  });
}
