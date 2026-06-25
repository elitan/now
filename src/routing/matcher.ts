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

      params[routeSegment.param ?? "slug"] =
        rest.length > 0 ? rest.map(decodeURIComponent) : undefined;
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
  const leftScore = scoreRoute(left.segments);
  const rightScore = scoreRoute(right.segments);

  if (leftScore !== rightScore) {
    return rightScore - leftScore;
  }

  if (left.segments.length !== right.segments.length) {
    return right.segments.length - left.segments.length;
  }

  return 0;
}

function scoreRoute(segments: RouteSegment[]): number {
  let score = 0;

  for (const segment of segments) {
    if (segment.kind === "static") {
      score += 10;
    } else if (segment.kind === "dynamic") {
      score += 5;
    } else if (segment.kind === "catchAll") {
      score += 1;
    } else {
      score -= 1;
    }
  }

  return score;
}
