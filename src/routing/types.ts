export type SegmentKind = "static" | "dynamic" | "catchAll" | "optionalCatchAll";

export interface RouteSegment {
  kind: SegmentKind;
  value: string;
  param?: string;
}

export type RouteParams = Record<string, string | string[]>;

export interface ClientRouteFile {
  id: string;
  routePath: string;
  filePath: string;
  segments: RouteSegment[];
  layouts: string[];
  loading?: string;
  error?: string;
}

export interface ApiRouteFile {
  id: string;
  routePath: string;
  filePath: string;
  segments: RouteSegment[];
}

export interface ScannedApp {
  appDir: string;
  clientRoutes: ClientRouteFile[];
  apiRoutes: ApiRouteFile[];
  notFound?: string;
}

export interface RouteMatch<TRoute> {
  route: TRoute;
  params: RouteParams;
}

export interface GeneratedServerRoute {
  id: string;
  routePath: string;
  modulePath: string;
  segments: RouteSegment[];
}

export interface GeneratedProxy {
  modulePath: string;
}

export interface ServerBuildManifest {
  apiRoutes: GeneratedServerRoute[];
  proxy?: GeneratedProxy;
}
