export async function POST(request: Request): Promise<Response> {
  const body = (await request.json()) as Record<string, unknown>;

  return Response.json({
    echo: body,
  });
}
