import { existsSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { scanFiles } from "../utils/files";
import {
  createRouteId,
  parseRouteSegments,
  pathSegmentsFromRouteDirectory,
  routePathFromSegments,
} from "./segments";
import type { ApiRouteFile, ClientRouteFile, RouteSegment, ScannedApp } from "./types";

const PAGE_FILE = "page.tsx";
const LAYOUT_FILE = "layout.tsx";
const LOADING_FILE = "loading.tsx";
const ERROR_FILE = "error.tsx";
const NOT_FOUND_FILE = "not-found.tsx";
const API_ROUTE_FILE = "route.ts";

interface ScannedRouteForConflict {
  filePath: string;
  segments: RouteSegment[];
}

export function scanApp(projectRoot: string): ScannedApp {
  const root = resolve(projectRoot);
  const appDir = join(root, "app");
  const scanned: ScannedApp = {
    appDir,
    clientRoutes: scanClientRoutes(root),
    apiRoutes: scanApiRoutes(root),
  };
  const notFound = scanNotFound(root);

  if (notFound) {
    scanned.notFound = notFound;
  }

  return scanned;
}

export function scanClientRoutes(projectRoot: string): ClientRouteFile[] {
  const root = resolve(projectRoot);
  const appDir = join(root, "app");

  if (!existsSync(appDir)) {
    return [];
  }

  const routes: ClientRouteFile[] = [];
  const files = scanFiles(appDir);
  assertNoClientPagesInsideApiDirectory(appDir, files);

  for (const file of files) {
    if (basename(file) !== PAGE_FILE) {
      continue;
    }

    const routeDirectory = dirname(file);
    const rawSegments = pathSegmentsFromRouteDirectory(appDir, routeDirectory);
    const segments = parseRouteSegments(rawSegments);

    if (isApiRouteSegments(segments)) {
      continue;
    }

    const relativePath = relative(appDir, file);
    const route: ClientRouteFile = {
      id: createRouteId(relativePath) || "root",
      routePath: routePathFromSegments(segments),
      filePath: file,
      segments,
      layouts: collectLayouts(appDir, routeDirectory),
    };
    const loading = findNearestConvention(appDir, routeDirectory, LOADING_FILE);
    const error = findNearestConvention(appDir, routeDirectory, ERROR_FILE);

    if (loading) {
      route.loading = loading;
    }

    if (error) {
      route.error = error;
    }

    routes.push(route);
  }

  assertNoRouteConflicts(routes, "client");

  return routes;
}

export function scanApiRoutes(projectRoot: string): ApiRouteFile[] {
  const root = resolve(projectRoot);
  const appDir = join(root, "app");

  if (!existsSync(appDir)) {
    return [];
  }

  const routes: ApiRouteFile[] = [];
  const files = scanFiles(appDir);
  assertNoClientPagesInsideApiDirectory(appDir, files);

  for (const file of files) {
    if (basename(file) !== API_ROUTE_FILE) {
      continue;
    }

    const routeDirectory = dirname(file);
    const rawSegments = pathSegmentsFromRouteDirectory(appDir, routeDirectory);
    const segments = parseRouteSegments(rawSegments);

    if (!isApiRouteSegments(segments)) {
      continue;
    }

    const relativePath = relative(appDir, file);

    routes.push({
      id: createRouteId(relativePath) || "api-root",
      routePath: routePathFromSegments(segments),
      filePath: file,
      segments,
    });
  }

  assertNoRouteConflicts(routes, "API");

  return routes;
}

export function scanNotFound(projectRoot: string): string | undefined {
  const root = resolve(projectRoot);
  const file = join(root, "app", NOT_FOUND_FILE);
  return existsSync(file) ? file : undefined;
}

function collectLayouts(appDir: string, routeDirectory: string): string[] {
  const directories = collectAncestorDirectories(appDir, routeDirectory);
  const layouts: string[] = [];

  for (const directory of directories) {
    const layout = join(directory, LAYOUT_FILE);
    if (existsSync(layout)) {
      layouts.push(layout);
    }
  }

  return layouts;
}

function findNearestConvention(
  appDir: string,
  routeDirectory: string,
  fileName: string,
): string | undefined {
  const directories = collectAncestorDirectories(appDir, routeDirectory).reverse();

  for (const directory of directories) {
    const file = join(directory, fileName);
    if (existsSync(file)) {
      return file;
    }
  }

  return undefined;
}

function collectAncestorDirectories(appDir: string, routeDirectory: string): string[] {
  const directories: string[] = [];
  let current = routeDirectory;

  while (current.startsWith(appDir)) {
    directories.push(current);
    if (current === appDir) {
      break;
    }
    current = dirname(current);
  }

  return directories.reverse();
}

function isApiRouteSegments(segments: RouteSegment[]): boolean {
  const firstSegment = segments[0];
  return firstSegment?.kind === "static" && firstSegment.value === "api";
}

function assertNoClientPagesInsideApiDirectory(appDir: string, files: string[]): void {
  for (const file of files) {
    if (basename(file) !== PAGE_FILE || !isInsidePhysicalApiDirectory(appDir, file)) {
      continue;
    }

    throw new Error(
      [
        `Invalid app/api route: ${relative(appDir, file)} is a client page inside app/api.`,
        "app/api is reserved for server route.ts files.",
      ].join(" "),
    );
  }
}

function isInsidePhysicalApiDirectory(appDir: string, file: string): boolean {
  const apiRelativePath = relative(join(appDir, "api"), file);
  return (
    Boolean(apiRelativePath) && !apiRelativePath.startsWith("..") && !isAbsolute(apiRelativePath)
  );
}

function assertNoRouteConflicts(
  routes: ScannedRouteForConflict[],
  routeType: "client" | "API",
): void {
  const seenRoutes = new Map<string, ScannedRouteForConflict>();

  for (const route of routes) {
    const key = routeConflictKey(route.segments);
    const previous = seenRoutes.get(key);

    if (previous) {
      throw new Error(
        [
          `Conflicting ${routeType} routes resolve to ${describeRouteShape(route.segments)}.`,
          previous.filePath,
          route.filePath,
        ].join("\n"),
      );
    }

    seenRoutes.set(key, route);
  }
}

function routeConflictKey(segments: RouteSegment[]): string {
  return segments
    .map(function mapSegment(segment) {
      if (segment.kind === "static") {
        return `static:${segment.value}`;
      }

      return segment.kind;
    })
    .join("/");
}

function describeRouteShape(segments: RouteSegment[]): string {
  const parts = segments.map(function mapSegment(segment) {
    if (segment.kind === "static") {
      return segment.value;
    }

    if (segment.kind === "dynamic") {
      return ":param";
    }

    if (segment.kind === "optionalCatchAll") {
      return "*param?";
    }

    return "*param";
  });

  if (parts.length === 0) {
    return "/";
  }

  return `/${parts.join("/")}`;
}
