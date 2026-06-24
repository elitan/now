import { existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
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

  for (const file of files) {
    if (!file.endsWith(API_ROUTE_FILE)) {
      continue;
    }

    const routeDirectory = dirname(file);
    const rawSegments = pathSegmentsFromRouteDirectory(apiDir, routeDirectory);
    const segments = parseRouteSegments(rawSegments);
    const relativePath = relative(apiDir, file);

    routes.push({
      id: createRouteId(`api/${relativePath}`) || "api-root",
      routePath: routePathFromSegments(segments, "/api"),
      filePath: file,
      segments: parseRouteSegments(["api", ...rawSegments]),
    });
  }

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
  return file.startsWith(`${join(appDir, "api")}/`);
}
