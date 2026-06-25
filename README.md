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
- Optional root `proxy.ts` request hook for redirects, rewrites, and headers.
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
proxy.ts
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

Every `app/api/**/route.ts` file is server-only. Handlers may export `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`, and `ALL`. If `GET` is present and `HEAD` is not, `now` runs the `GET` handler for `HEAD` requests and removes the response body. If `OPTIONS` is not exported, `now` generates a 204 response with an `Allow` header from the available handlers. `ALL` remains the fallback for adapter-style routes when a specific method export is not present.
Route groups may appear before or inside `api`, so `app/(internal)/api/grouped/route.ts` maps to `/api/grouped`.

Root proxy:

- `proxy.ts` at the project root runs once before static files, API routes, and SPA fallback.
- Export either `proxy` or a default function.
- Return a normal `Response` to handle the request directly. `Response.redirect()` also works for absolute URLs.
- Return nothing to continue to the normal server pipeline.
- Use `next()`, `rewrite()`, or `redirect()` from `now/server` for response headers, request header forwarding, relative redirects, and internal rewrites.

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

export function ALL(request: Request, context: ApiRouteContext<"/api/rpc/[...path]">): Response {
  const url = new URL(request.url);

  return Response.json({
    path: url.pathname,
    rpcPath: context.params.path
  });
}
```

`ALL` is an adapter-friendly fallback that runs for any HTTP method when a specific method export is not present.

## Proxy Convention

```ts
// proxy.ts
import { next, redirect, rewrite } from "now/server";

export function proxy(request: Request): Response | undefined {
  const url = new URL(request.url);

  if (url.pathname === "/old") {
    return redirect("/new", 308);
  }

  if (url.pathname === "/healthz") {
    const response = rewrite(new URL("/api/health", request.url));
    response.headers.set("x-proxy", "rewrite");

    return response;
  }

  const response = next();
  response.headers.set("x-powered-by", "now");

  return response;
}
```

Proxy runs before the framework decides whether a request is for a static asset, an API route, or the client app fallback. A rewrite changes the URL used by that downstream dispatch without issuing a browser redirect and does not run proxy a second time. To forward modified request headers, pass a full `Headers` object through `next({ request: { headers } })` or `rewrite(url, { request: { headers } })`.

Request bodies are intentionally conservative: proxy receives the original `Request`, and downstream handlers receive the same body stream unless you create a forwarded request. Do not read a request body in proxy before continuing or rewriting to an API route that also needs to read it.

## Commands

Create a new app:

```bash
npm exec now@latest -- create my-app
cd my-app
npm install
npm run dev
```

If `now` is already installed globally or in a workspace, you can also run:

```bash
now create my-app
```

The starter includes a TypeScript `app/` directory, a client route, a nested route, a server
health route, and scripts for `dev`, `build`, `start`, `typecheck`, and `verify`.

```bash
npm run dev:example
npm run build:example
npm run start:example
npm run verify
```

The package CLI supports:

```bash
now create [directory]
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
- Proxy request bodies are single-use streams; body reads in proxy are not replayed downstream.
- Production server output expects the project dependencies to be installed.
