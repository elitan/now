import { relative, sep } from "node:path";
import type { RouteParams, RouteSegment } from "./types";

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

  validateCatchAllPosition(segments);

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

    if (segment.kind === "catchAll") {
      parts.push(`*${segment.param}`);
      continue;
    }

    parts.push(`*${segment.param}?`);
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

function validateCatchAllPosition(segments: RouteSegment[]): void {
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];

    if (!segment) {
      continue;
    }

    if (
      (segment.kind === "catchAll" || segment.kind === "optionalCatchAll") &&
      index !== segments.length - 1
    ) {
      throw new Error(`Catch-all route segment "${segment.value}" must be the last segment.`);
    }
  }
}

export type RouteParamsForPath<Path extends string> = string extends Path
  ? RouteParams
  : Prettify<ParseRouteParams<StripLeadingSlash<Path>>>;

type Prettify<TValue> = {
  [Key in keyof TValue as Key extends typeof emptyRouteParamsSymbol ? never : Key]: TValue[Key];
};

declare const emptyRouteParamsSymbol: unique symbol;

type EmptyRouteParams = {
  [emptyRouteParamsSymbol]?: never;
};

type StripLeadingSlash<Path extends string> = Path extends `/${infer Rest}`
  ? StripLeadingSlash<Rest>
  : Path;

type ParseRouteParams<Path extends string> = Path extends ""
  ? EmptyRouteParams
  : Path extends `${infer Segment}/${infer Rest}`
    ? SegmentParam<Segment> & ParseRouteParams<Rest>
    : SegmentParam<Path>;

type SegmentParam<Segment extends string> = Segment extends `[[...${infer Param}]]`
  ? { [Key in Param]?: string[] }
  : Segment extends `[...${infer Param}]`
    ? { [Key in Param]: string[] }
    : Segment extends `[${infer Param}]`
      ? { [Key in Param]: string }
      : Segment extends `:${infer Param}`
        ? { [Key in Param]: string }
        : Segment extends `*${infer Param}?`
          ? { [Key in Param]?: string[] }
          : Segment extends `*${infer Param}`
            ? { [Key in Param]: string[] }
            : EmptyRouteParams;
