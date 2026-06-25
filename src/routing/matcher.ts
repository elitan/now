import type { RouteMatch, RouteParams, RouteSegment } from "./types";

export interface MatchableRoute {
  segments: RouteSegment[];
}

export function rankRoutes<TRoute extends MatchableRoute>(routes: TRoute[]): TRoute[] {
  return [...routes].sort(compareRoutes);
}

export function matchRoute<TRoute extends MatchableRoute>(
  routes: TRoute[],
  pathname: string,
): RouteMatch<TRoute> | undefined {
  const normalizedSegments = splitPathname(pathname);
  const rankedRoutes = rankRoutes(routes);

  for (const route of rankedRoutes) {
    const params = matchSegments(route.segments, normalizedSegments);

    if (params) {
      return {
        route,
        params,
      };
    }
  }

  return undefined;
}

export function matchSegments(
  routeSegments: RouteSegment[],
  pathnameSegments: string[],
): RouteParams | undefined {
  const params: RouteParams = {};
  let pathIndex = 0;

  for (let routeIndex = 0; routeIndex < routeSegments.length; routeIndex += 1) {
    const routeSegment = routeSegments[routeIndex];

    if (!routeSegment) {
      return undefined;
    }

    if (routeSegment.kind === "catchAll" || routeSegment.kind === "optionalCatchAll") {
      const rest = pathnameSegments.slice(pathIndex);

      if (routeSegment.kind === "catchAll" && rest.length === 0) {
        return undefined;
      }

      params[routeSegment.param ?? "slug"] = rest.map(decodeURIComponent);
      pathIndex = pathnameSegments.length;
      break;
    }

    const pathnameSegment = pathnameSegments[pathIndex];

    if (!pathnameSegment) {
      return undefined;
    }

    if (routeSegment.kind === "static") {
      if (routeSegment.value !== pathnameSegment) {
        return undefined;
      }
      pathIndex += 1;
      continue;
    }

    params[routeSegment.param ?? routeSegment.value] = decodeURIComponent(pathnameSegment);
    pathIndex += 1;
  }

  if (pathIndex !== pathnameSegments.length) {
    return undefined;
  }

  return params;
}

export function splitPathname(pathname: string): string[] {
  const pathOnly = pathname.split("?")[0] ?? "/";
  return pathOnly
    .replace(/\/+/g, "/")
    .replace(/^\/|\/$/g, "")
    .split("/")
    .filter(Boolean);
}

function compareRoutes(left: MatchableRoute, right: MatchableRoute): number {
  const segmentComparison = compareSegmentSpecificity(left.segments, right.segments);

  if (segmentComparison !== 0) {
    return segmentComparison;
  }

  return routeSignature(left.segments).localeCompare(routeSignature(right.segments));
}

function compareSegmentSpecificity(left: RouteSegment[], right: RouteSegment[]): number {
  const maxLength = Math.max(left.length, right.length);

  for (let index = 0; index < maxLength; index += 1) {
    const leftPriority = segmentPriority(left[index]);
    const rightPriority = segmentPriority(right[index]);

    if (leftPriority !== rightPriority) {
      return rightPriority - leftPriority;
    }
  }

  return 0;
}

function segmentPriority(segment: RouteSegment | undefined): number {
  if (!segment) {
    return 1;
  }

  if (segment.kind === "static") {
    return 4;
  }

  if (segment.kind === "dynamic") {
    return 3;
  }

  if (segment.kind === "catchAll") {
    return 2;
  }

  return 0;
}

function routeSignature(segments: RouteSegment[]): string {
  return segments
    .map(function mapSegment(segment) {
      return `${segment.kind}:${segment.value}`;
    })
    .join("/");
}
