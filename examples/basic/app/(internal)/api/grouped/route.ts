export function GET(): Response {
  return Response.json({
    grouped: true,
    runtime: "server",
  });
}
