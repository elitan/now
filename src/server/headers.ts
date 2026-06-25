import type { OutgoingHttpHeader, OutgoingHttpHeaders, ServerResponse } from "node:http";

type WriteHeadHeaders = OutgoingHttpHeaders | OutgoingHttpHeader[];

export function mergeResponseHeaders(response: Response, headers: Headers): Response {
  if (!hasHeaders(headers)) {
    return response;
  }

  const merged = new Headers(response.headers);

  headers.forEach(function setHeader(value, key) {
    merged.set(key, value);
  });

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: merged,
  });
}

export function applyHeadersToNodeResponse(response: ServerResponse, headers: Headers): void {
  headers.forEach(function setHeader(value, key) {
    response.setHeader(key, value);
  });
}

export function installNodeResponseHeaderOverride(
  response: ServerResponse,
  headers: Headers,
): () => void {
  if (!hasHeaders(headers)) {
    return function noop() {};
  }

  const originalWriteHead = response.writeHead;
  const originalSetHeader = response.setHeader;
  const protectedHeaderNames = headerNames(headers);

  applyHeadersToNodeResponse(response, headers);

  response.setHeader = function setHeader(this: ServerResponse, name, value) {
    if (protectedHeaderNames.has(name.toLowerCase())) {
      return this;
    }

    return originalSetHeader.call(this, name, value);
  } as ServerResponse["setHeader"];

  response.writeHead = function writeHead(
    this: ServerResponse,
    statusCode: number,
    statusMessage?: string | WriteHeadHeaders,
    writeHeadHeaders?: WriteHeadHeaders,
  ): ServerResponse {
    if (typeof statusMessage === "string") {
      return Reflect.apply(originalWriteHead, this, [
        statusCode,
        statusMessage,
        mergeWriteHeadHeaders(writeHeadHeaders, headers),
      ]) as ServerResponse;
    }

    return Reflect.apply(originalWriteHead, this, [
      statusCode,
      mergeWriteHeadHeaders(statusMessage, headers),
    ]) as ServerResponse;
  } as ServerResponse["writeHead"];

  return function restoreHeaderOverrides() {
    response.writeHead = originalWriteHead;
    response.setHeader = originalSetHeader;
  };
}

function hasHeaders(headers: Headers): boolean {
  let hasHeader = false;

  headers.forEach(function markHeader() {
    hasHeader = true;
  });

  return hasHeader;
}

function mergeWriteHeadHeaders(
  writeHeadHeaders: WriteHeadHeaders | undefined,
  protectedHeaders: Headers,
): OutgoingHttpHeaders {
  const merged: OutgoingHttpHeaders = {};

  if (Array.isArray(writeHeadHeaders)) {
    for (let index = 0; index < writeHeadHeaders.length; index += 2) {
      const key = writeHeadHeaders[index];
      const value = writeHeadHeaders[index + 1];

      if (typeof key === "string" && value !== undefined) {
        merged[key] = value;
      }
    }
  } else if (writeHeadHeaders) {
    Object.assign(merged, writeHeadHeaders);
  }

  protectedHeaders.forEach(function setProtectedHeader(value, key) {
    merged[key] = value;
  });

  return merged;
}

function headerNames(headers: Headers): Set<string> {
  const names = new Set<string>();

  headers.forEach(function addHeaderName(_value, key) {
    names.add(key.toLowerCase());
  });

  return names;
}
