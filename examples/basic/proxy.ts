import { next, redirect, rewrite } from "now/server";

export function proxy(request: Request): Response | undefined {
  const url = new URL(request.url);

  if (url.pathname === "/proxy-direct") {
    return new Response("handled by proxy", {
      headers: {
        "x-proxy-direct": "true",
      },
    });
  }

  if (url.pathname === "/proxy-redirect") {
    return redirect("/about", 308);
  }

  if (url.pathname === "/api/proxy-header" && url.searchParams.get("via") === "next") {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-from-proxy", "next-api");

    const response = next({
      request: {
        headers: requestHeaders,
      },
    });
    response.headers.set("x-proxy-next", "api");

    return response;
  }

  if (url.pathname === "/proxy-rewrite-api") {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-from-proxy", "rewrite-api");

    const response = rewrite(new URL("/api/proxy-header", request.url), {
      request: {
        headers: requestHeaders,
      },
    });
    response.headers.set("x-proxy-rewrite", "api");

    return response;
  }

  if (url.pathname === "/proxy-rewrite-static") {
    const response = rewrite(new URL("/proxy-static.txt", request.url));
    response.headers.set("cache-control", "proxy-cache");
    response.headers.set("x-proxy-rewrite", "static");

    return response;
  }

  if (url.pathname === "/proxy-rewrite-page") {
    const response = rewrite(new URL("/about?from=proxy", request.url));
    response.headers.set("x-proxy-rewrite", "page");

    return response;
  }

  if (url.pathname === "/proxy-static.txt") {
    const response = next();
    response.headers.set("cache-control", "proxy-cache");
    response.headers.set("x-proxy-next", "static");

    return response;
  }

  if (url.pathname === "/proxy-next-page") {
    const response = next();
    response.headers.set("x-proxy-next", "page");

    return response;
  }

  return undefined;
}
