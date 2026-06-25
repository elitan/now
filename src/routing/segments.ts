import { relative, sep } from "node:path";
import type { RouteSegment } from "./types";

export function pathSegmentsFromRouteDirectory(appDir: string, routeDirectory: string): string[] {
  const relativePath = relative(appDir, routeDirectory);

  if (!relativePath) {
    return [];
  }

  return relativePath.split(sep).filter(Boolean);
}

export function parseRouteSegments(rawSegments: string[]): RouteSegment[] {
  const segments: RouteSegment[] = [];

  for (const rawSegment of rawSegments) {
    if (isRouteGroup(rawSegment)) {
      continue;
    }

    if (rawSegment.startsWith("[[...") && rawSegment.endsWith("]]")) {
      const param = rawSegment.slice(5, -2);
      validateParam(param, rawSegment);
      segments.push({
        kind: "optionalCatchAll",
        value: rawSegment,
        param,
      });
      continue;
    }

    if (rawSegment.startsWith("[...") && rawSegment.endsWith("]")) {
      const param = rawSegment.slice(4, -1);
      validateParam(param, rawSegment);
      segments.push({
        kind: "catchAll",
        value: rawSegment,
        param,
      });
      continue;
    }

    if (rawSegment.startsWith("[") && rawSegment.endsWith("]")) {
      const param = rawSegment.slice(1, -1);
      validateParam(param, rawSegment);
      segments.push({
        kind: "dynamic",
        value: rawSegment,
        param,
      });
      continue;
    }

    segments.push({
      kind: "static",
      value: rawSegment,
    });
  }

  validateCatchAllSegmentsAreTerminal(segments);
  return segments;
}

export function routePathFromSegments(segments: RouteSegment[], prefix = ""): string {
  const parts: string[] = [];

  for (const segment of segments) {
    if (segment.kind === "static") {
      parts.push(segment.value);
      continue;
    }

    if (segment.kind === "dynamic") {
      parts.push(`:${segment.param}`);
      continue;
    }

    if (segment.kind === "optionalCatchAll") {
      parts.push(`*${segment.param}?`);
      continue;
    }

    parts.push(`*${segment.param}`);
  }

  const joined = parts.join("/");
  const normalizedPrefix = prefix === "/" ? "" : prefix;

  if (!joined) {
    return normalizedPrefix || "/";
  }

  return `${normalizedPrefix}/${joined}`.replace(/\/+/g, "/");
}

export function createRouteId(relativePath: string): string {
  return relativePath
    .replace(/\\/g, "/")
    .replace(/\[\[\.\.\.([^\]]+)\]\]/g, "optional-catch-all-$1")
    .replace(/\[\.\.\.([^\]]+)\]/g, "catch-all-$1")
    .replace(/\[([^\]]+)\]/g, "dynamic-$1")
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

export function isRouteGroup(segment: string): boolean {
  return segment.startsWith("(") && segment.endsWith(")");
}

function validateParam(param: string, segment: string): void {
  if (!param || param.includes("/") || param.includes("[") || param.includes("]")) {
    throw new Error(`Invalid route segment "${segment}".`);
  }
}

function validateCatchAllSegmentsAreTerminal(segments: RouteSegment[]): void {
  const catchAllSegment = segments.find(function findCatchAll(segment) {
    return segment.kind === "catchAll" || segment.kind === "optionalCatchAll";
  });

  if (!catchAllSegment) {
    return;
  }

  if (segments.indexOf(catchAllSegment) === segments.length - 1) {
    return;
  }

  throw new Error(
    `Catch-all route segment "${catchAllSegment.value}" must be the final route segment.`,
  );
}
