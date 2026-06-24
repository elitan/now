import { join, resolve } from "node:path";
import type { Plugin, ViteDevServer } from "vite";
import { scanApp } from "../routing/scanner";
import type { ClientRouteFile } from "../routing/types";
import { normalizePath, toViteFsPath } from "./paths";

const VIRTUAL_ROUTES_ID = "virtual:next2/routes";
const RESOLVED_VIRTUAL_ROUTES_ID = `\0${VIRTUAL_ROUTES_ID}`;

export interface Next2PluginOptions {
  projectRoot: string;
}

export function next2Plugin(options: Next2PluginOptions): Plugin {
  const projectRoot = resolve(options.projectRoot);

  return {
    name: "next2-routes",
    resolveId(id: string) {
      if (id === VIRTUAL_ROUTES_ID) {
        return RESOLVED_VIRTUAL_ROUTES_ID;
      }

      return undefined;
    },
    load(id: string) {
      if (id !== RESOLVED_VIRTUAL_ROUTES_ID) {
        return undefined;
      }

      return generateRoutesModule(projectRoot);
    },
    configureServer(server: ViteDevServer) {
      const appDir = join(projectRoot, "app");
      server.watcher.add(appDir);
      server.watcher.on("all", function handleRouteChange(_eventName, file) {
        if (!normalizePath(file).includes("/app/")) {
          return;
        }

        const module = server.moduleGraph.getModuleById(RESOLVED_VIRTUAL_ROUTES_ID);

        if (module) {
          server.moduleGraph.invalidateModule(module);
        }

        server.ws.send({
          type: "full-reload",
        });
      });
    },
  };
}

export function generateRoutesModule(projectRoot: string): string {
  const scanned = scanApp(projectRoot);
  const imports: string[] = [];
  const routeObjects: string[] = [];

  let index = 0;

  for (const route of scanned.clientRoutes) {
    routeObjects.push(generateRouteObject(route, index, imports));
    index += 1;
  }

  if (scanned.notFound) {
    imports.push(`import * as NotFoundModule from "${toViteFsPath(scanned.notFound)}";`);
  }

  return [
    ...imports,
    "",
    `export const routes = [${routeObjects.join(",")}];`,
    scanned.notFound
      ? "export const notFoundComponent = NotFoundModule.default;"
      : "export const notFoundComponent = undefined;",
    "",
  ].join("\n");
}

function generateRouteObject(route: ClientRouteFile, index: number, imports: string[]): string {
  const loadingIdentifier = `Loading${index}`;
  const errorIdentifier = `Error${index}`;

  if (route.loading) {
    imports.push(`import * as ${loadingIdentifier} from "${toViteFsPath(route.loading)}";`);
  }

  if (route.error) {
    imports.push(`import * as ${errorIdentifier} from "${toViteFsPath(route.error)}";`);
  }

  const layoutLoaders = route.layouts.map(function mapLayout(layout, layoutIndex) {
    return `function layout${index}_${layoutIndex}() { return import("${toViteFsPath(layout)}"); }`;
  });

  const properties = [
    `id: ${JSON.stringify(route.id)}`,
    `routePath: ${JSON.stringify(route.routePath)}`,
    `segments: ${JSON.stringify(route.segments)}`,
    `page: function page${index}() { return import("${toViteFsPath(route.filePath)}"); }`,
    `layouts: [${layoutLoaders.join(", ")}]`,
  ];

  if (route.loading) {
    properties.push(`loadingComponent: ${loadingIdentifier}.default`);
  }

  if (route.error) {
    properties.push(`errorComponent: ${errorIdentifier}.default`);
  }

  return `{ ${properties.join(", ")} }`;
}
