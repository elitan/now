# now

`now` is a small client-first React framework inspired by Next.js routing. It uses Vite for the browser bundle, renders pages on the client, and keeps everything under `app/api` on the server.

This is a v0 prototype. It intentionally does not implement SSR or React Server Components.

## Features

- TypeScript-only user apps.
- `app/` file-based client router.
- Static, dynamic, catch-all, and optional catch-all routes.
- Mandatory nested `layout.tsx` support.
- `loading.tsx`, `error.tsx`, and `not-found.tsx` conventions.
- Server routes under `app/api` with standard `Request` and `Response`.
- One server for Vite dev, production static assets, and server routes.
- Node runtime support and Bun smoke coverage where Bun is installed.

## App Conventions

```txt
app/
  layout.tsx
  page.tsx
  about/
    page.tsx
  (marketing)/
    layout.tsx
    campaign/
      page.tsx
  blog/
    [slug]/
      page.tsx
  docs/
    [[...slug]]/
      page.tsx
  api/
    health/
      route.ts
  (internal)/
    api/
      grouped/
        route.ts
```

Client routes:

- `app/page.tsx` maps to `/`.
- `app/about/page.tsx` maps to `/about`.
- `app/(marketing)/campaign/page.tsx` maps to `/campaign`.
- `app/blog/[slug]/page.tsx` maps to `/blog/:slug`.
- `app/docs/[...slug]/page.tsx` maps to `/docs/*slug`.
- `app/docs/[[...slug]]/page.tsx` maps to `/docs/*slug?` and also matches `/docs`.

Route groups:

- Folder names wrapped in parentheses are organizational and do not add URL segments.
- Group folders may contain route conventions such as `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, and `route.ts`.
- Routes in different groups must not resolve to the same path.

Server routes:

```ts
export function GET(request: Request): Response {
  return Response.json({ ok: true });
}
```

Every `app/api/**/route.ts` file is server-only. Handlers may export `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`, and `ALL`.
Route groups may appear before or inside `api`, so `app/(internal)/api/grouped/route.ts` maps to `/api/grouped`.

## Runtime APIs

```tsx
import { Link, useParams, useRouter, useSearchParams } from "now/client";

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

## Server Route Convention

Use `app/api` for all server-side routes. For RPC libraries, make a catch-all server route. The core accepts standard fetch-style handlers, so tRPC, oRPC, Hono, or your own router can be adapted without becoming a core dependency.

```ts
// app/api/rpc/[...path]/route.ts
import type { ApiRouteContext } from "now/server";

export function ALL(request: Request, context: ApiRouteContext): Response {
  const url = new URL(request.url);

  return Response.json({
    path: url.pathname,
    rpcPath: context.params.path
  });
}
```

`ALL` is an adapter-friendly fallback that runs for any HTTP method when a specific method export is not present.

## Commands

```bash
npm run dev:example
npm run build:example
npm run start:example
npm run verify
```

The package CLI supports:

```bash
now dev [root] --port 3000
now build [root]
now start [root] --port 3000
```

## Nitro Decision

Nitro was evaluated as the server layer. The current implementation uses a minimal custom server because the public API needs to preserve Next-style `app/api/**/route.ts` server routes and framework-owned SPA fallback behavior. See `docs/adr/0001-server-runtime.md`.

## Known Limitations

- No SSR in v0.
- No React Server Components.
- `loading.tsx` is used as route-load pending UI, not streaming UI.
- Catch-all params are exposed as arrays through `useParams`.
- Optional catch-all params are exposed as empty arrays for the base path.
- Production server output expects the project dependencies to be installed.
