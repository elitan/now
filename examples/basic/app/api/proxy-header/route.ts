export function GET(request: Request): Response {
  return Response.json({
    fromProxy: request.headers.get("x-from-proxy"),
  });
}
