import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { MountEntry, ServerModule } from "./index";
import { normalizeMountPath, ServerApp } from "./index";

export type ModuleLoader = (file: string) => Promise<unknown>;

export async function loadServerMounts(
  projectRoot: string,
  loadModule: ModuleLoader,
): Promise<MountEntry[]> {
  const serverFile = resolve(projectRoot, "server.ts");

  if (!existsSync(serverFile)) {
    return [];
  }

  return loadServerMountsFromFile(serverFile, loadModule);
}

export async function loadServerMountsFromFile(
  serverFile: string,
  loadModule: ModuleLoader,
): Promise<MountEntry[]> {
  const module = (await loadModule(serverFile)) as {
    default?: ServerModule | ServerModule["setup"];
  };
  const serverModule = normalizeServerModule(module.default);

  if (!serverModule) {
    return [];
  }

  const app = new ServerApp();
  await serverModule.setup(app);
  return app.getMounts();
}

export async function dispatchMountRequest(
  request: Request,
  mounts: MountEntry[],
): Promise<Response | undefined> {
  const url = new URL(request.url);

  for (const mount of mounts) {
    if (!matchesMount(url.pathname, mount.path)) {
      continue;
    }

    return mount.handler(request, {
      path: url.pathname,
    });
  }

  return undefined;
}

function normalizeServerModule(value: unknown): ServerModule | undefined {
  if (!value) {
    return undefined;
  }

  if (typeof value === "function") {
    return {
      setup: value as ServerModule["setup"],
    };
  }

  if (typeof value === "object" && "setup" in value) {
    return value as ServerModule;
  }

  return undefined;
}

function matchesMount(pathname: string, mountPath: string): boolean {
  const normalized = normalizeMountPath(mountPath);

  if (normalized === "/") {
    return true;
  }

  return pathname === normalized || pathname.startsWith(`${normalized}/`);
}
