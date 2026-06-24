# next2

`next2` is a small client-first React framework inspired by Next.js routing. It uses Vite for the browser bundle, renders pages on the client, and keeps API/RPC handlers on the server.

This is a v0 prototype. It intentionally does not implement SSR or React Server Components.

## Features

- TypeScript-only user apps.
- `app/` file-based client router.
- Static, dynamic, and catch-all routes.
- Mandatory nested `layout.tsx` support.
- `loading.tsx`, `error.tsx`, and `not-found.tsx` conventions.
- Server API routes with standard `Request` and `Response`.
- RPC-agnostic server mounts.
- One server for Vite dev, production static assets, API routes, and RPC mounts.
- Node runtime support and Bun smoke coverage where Bun is installed.

## App Conventions

```txt
app/
  layout.tsx
  page.tsx
  about/
    page.tsx
  blog/
    [slug]/
      page.tsx
  docs/
    [...slug]/
      page.tsx
  api/
    health/
      route.ts
```

Client routes:

- `app/page.tsx` maps to `/`.
- `app/about/page.tsx` maps to `/about`.
- `app/blog/[slug]/page.tsx` maps to `/blog/:slug`.
- `app/docs/[...slug]/page.tsx` maps to `/docs/*slug`.

API routes:

```ts
export function GET(request: Request): Response {
  return Response.json({ ok: true });
}
```

API handlers may export `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, and `OPTIONS`.

## Runtime APIs

```tsx
import { Link, useParams, useRouter, useSearchParams } from "next2/client";

export default function Page() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  return (
    <main>
      <Link href="/about">About</Link>
      <button type="button" onClick={function handleClick() {
        router.push(`/blog/${params.slug ?? "hello"}`);
      }}>
        Go
      </button>
      <p>{searchParams.get("q")}</p>
    </main>
  );
}
```

## RPC-Agnostic Mounts

Use `server.ts` for server-side mounts. The core accepts standard fetch-style handlers, so tRPC, oRPC, Hono, or your own router can be adapted without becoming a core dependency.

```ts
import { defineServer } from "next2/server";

export default defineServer(function configure(server) {
  server.mount("/rpc", async function handleRpc(request) {
    return Response.json({
      path: new URL(request.url).pathname
    });
  });
});
```

## Commands

```bash
npm run dev:example
npm run build:example
npm run start:example
npm run verify
```

The package CLI supports:

```bash
next2 dev [root] --port 3000
next2 build [root]
next2 start [root] --port 3000
```

## Nitro Decision

Nitro was evaluated as the server layer. The current implementation uses a minimal custom server because the public API needs to preserve Next-style `app/api/**/route.ts` method exports, framework-owned SPA fallback behavior, and an RPC-agnostic mount API. See `docs/adr/0001-server-runtime.md`.

## Known Limitations

- No SSR in v0.
- No React Server Components.
- `loading.tsx` is used as route-load pending UI, not streaming UI.
- Catch-all params are exposed as arrays through `useParams`.
- Production server output expects the project dependencies to be installed.

