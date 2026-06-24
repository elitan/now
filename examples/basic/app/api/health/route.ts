export function GET(): Response {
  return Response.json({
    ok: true,
    runtime: "server",
  });
}

export function HEAD(): Response {
  return new Response(null, {
    status: 204,
  });
}

export function OPTIONS(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      allow: "GET, HEAD, OPTIONS",
    },
  });
}
