export type ServerHandler = (
  request: Request,
  context: ServerHandlerContext,
) => Response | Promise<Response>;

export interface ServerHandlerContext {
  path: string;
}

export interface ServerModule {
  setup: (server: ServerApp) => void | Promise<void>;
}

export interface MountEntry {
  path: string;
  handler: ServerHandler;
}

export class ServerApp {
  private readonly mounts: MountEntry[] = [];

  mount(path: string, handler: ServerHandler): void {
    const normalized = normalizeMountPath(path);

    this.mounts.push({
      path: normalized,
      handler,
    });
  }

  getMounts(): MountEntry[] {
    return [...this.mounts];
  }
}

export function defineServer(setup: (server: ServerApp) => void | Promise<void>): ServerModule {
  return {
    setup,
  };
}

export function normalizeMountPath(path: string): string {
  if (!path.startsWith("/")) {
    return `/${path}`;
  }

  return path.replace(/\/+$/g, "") || "/";
}

export type { ApiRouteContext, ApiRouteHandler } from "./api";
