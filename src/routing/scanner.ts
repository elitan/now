import { existsSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { scanFiles } from "../utils/files";
import {
  createRouteId,
  parseRouteSegments,
  pathSegmentsFromRouteDirectory,
  routePathFromSegments,
} from "./segments";
import type { ApiRouteFile, ClientRouteFile, ScannedApp } from "./types";

const PAGE_FILE = "page.tsx";
const LAYOUT_FILE = "layout.tsx";
const LOADING_FILE = "loading.tsx";
const ERROR_FILE = "error.tsx";
const NOT_FOUND_FILE = "not-found.tsx";
const API_ROUTE_FILE = "route.ts";

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
    if (!file.endsWith(PAGE_FILE) || isInsideApiDirectory(appDir, file)) {
      continue;
    }

    const routeDirectory = dirname(file);
    const rawSegments = pathSegmentsFromRouteDirectory(appDir, routeDirectory);
    const segments = parseRouteSegments(rawSegments);
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

  assertUniqueRoutePatterns(appDir, routes, "client");

  return routes;
}

export function scanApiRoutes(projectRoot: string): ApiRouteFile[] {
  const root = resolve(projectRoot);
  const appDir = join(root, "app");
  const apiDir = join(appDir, "api");

  if (!existsSync(apiDir)) {
    return [];
  }

  const routes: ApiRouteFile[] = [];
  const files = scanFiles(apiDir);
  assertNoClientPagesInsideApiDirectory(appDir, files);

  for (const file of files) {
    if (!file.endsWith(API_ROUTE_FILE)) {
      continue;
    }

    const routeDirectory = dirname(file);
    const rawSegments = pathSegmentsFromRouteDirectory(apiDir, routeDirectory);
    const routePathSegments = parseRouteSegments(rawSegments);
    const runtimeSegments = parseRouteSegments(["api", ...rawSegments]);
    const relativePath = relative(apiDir, file);

    routes.push({
      id: createRouteId(`api/${relativePath}`) || "api-root",
      routePath: routePathFromSegments(routePathSegments, "/api"),
      filePath: file,
      segments: runtimeSegments,
    });
  }

  assertUniqueRoutePatterns(appDir, routes, "API");

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

function isInsideApiDirectory(appDir: string, file: string): boolean {
  const apiRelativePath = relative(join(appDir, "api"), file);
  return (
    Boolean(apiRelativePath) && !apiRelativePath.startsWith("..") && !isAbsolute(apiRelativePath)
  );
}

function assertNoClientPagesInsideApiDirectory(appDir: string, files: string[]): void {
  for (const file of files) {
    if (!file.endsWith(PAGE_FILE) || !isInsideApiDirectory(appDir, file)) {
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

function assertUniqueRoutePatterns(
  appDir: string,
  routes: Array<ClientRouteFile | ApiRouteFile>,
  kind: "client" | "API",
): void {
  const seen = new Map<string, ClientRouteFile | ApiRouteFile>();

  for (const route of routes) {
    const key = routePatternKey(route);
    const existing = seen.get(key);

    if (existing) {
      throw new Error(
        [
          `Conflicting ${kind} routes resolve to the same URL shape:`,
          `${relative(appDir, existing.filePath)} and ${relative(appDir, route.filePath)}.`,
          "Rename one route segment or remove the route group conflict.",
        ].join(" "),
      );
    }

    seen.set(key, route);
  }
}

function routePatternKey(route: ClientRouteFile | ApiRouteFile): string {
  return route.segments
    .map(function mapSegment(segment) {
      if (segment.kind === "static") {
        return `static:${segment.value}`;
      }

      return segment.kind;
    })
    .join("/");
}
