import { createReadStream, existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { Readable } from "node:stream";

export async function serveStaticFile(
  request: Request,
  publicDirectory: string,
): Promise<Response | undefined> {
  const url = new URL(request.url);
  const pathname = decodeURIComponent(url.pathname);

  if (!hasFileExtension(pathname)) {
    return undefined;
  }

  const file = resolve(publicDirectory, `.${normalize(pathname)}`);

  if (!file.startsWith(resolve(publicDirectory)) || !existsSync(file)) {
    return new Response("Not Found", {
      status: 404,
    });
  }

  const stat = statSync(file);

  if (!stat.isFile()) {
    return undefined;
  }

  return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, {
    headers: {
      "content-type": contentType(file),
      "cache-control": cacheControl(file),
    },
  });
}

export async function serveSpaFallback(clientDirectory: string): Promise<Response> {
  const html = await readFile(join(clientDirectory, "index.html"), "utf8");

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
    },
  });
}

export function hasFileExtension(pathname: string): boolean {
  return Boolean(extname(pathname));
}

function contentType(file: string): string {
  const extension = extname(file);

  if (extension === ".html") {
    return "text/html; charset=utf-8";
  }

  if (extension === ".js" || extension === ".mjs") {
    return "text/javascript; charset=utf-8";
  }

  if (extension === ".css") {
    return "text/css; charset=utf-8";
  }

  if (extension === ".json") {
    return "application/json; charset=utf-8";
  }

  if (extension === ".svg") {
    return "image/svg+xml";
  }

  if (extension === ".png") {
    return "image/png";
  }

  if (extension === ".jpg" || extension === ".jpeg") {
    return "image/jpeg";
  }

  return "application/octet-stream";
}

function cacheControl(file: string): string {
  if (file.includes("/assets/")) {
    return "public, max-age=31536000, immutable";
  }

  return "no-cache";
}
