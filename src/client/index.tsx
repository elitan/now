import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { matchRoute } from "../routing/matcher";
import type { RouteParams, RouteSegment } from "../routing/types";

export type RouteModule = {
  default: React.ComponentType<Record<string, unknown>>;
};

export type RouteModuleLoader = () => Promise<RouteModule>;

export interface GeneratedClientRoute {
  id: string;
  routePath: string;
  segments: RouteSegment[];
  page: RouteModuleLoader;
  layouts: RouteModuleLoader[];
  loadingComponent?: React.ComponentType;
  errorComponent?: React.ComponentType<ErrorViewProps>;
}

export interface ErrorViewProps {
  error: unknown;
  reset: () => void;
}

export interface BootOptions {
  routes: GeneratedClientRoute[];
  notFoundComponent?: React.ComponentType;
}

export interface RouterState {
  pathname: string;
  search: string;
}

export interface RouterApi extends RouterState {
  push: (href: string) => void;
  replace: (href: string) => void;
  back: () => void;
  forward: () => void;
  prefetch: (href: string) => Promise<void>;
}

interface LoadedRoute {
  id: string;
  page: React.ComponentType<Record<string, unknown>>;
  layouts: React.ComponentType<React.PropsWithChildren>[];
}

interface RouteViewState {
  status: "idle" | "loading" | "ready" | "error";
  routeId?: string;
  loaded?: LoadedRoute;
  error?: unknown;
}

const RouterContext = createContext<RouterApi | undefined>(undefined);
const ParamsContext = createContext<RouteParams>({});
const routePreloadCache = new Map<string, Promise<LoadedRoute>>();

export function boot(options: BootOptions): void {
  const rootElement = document.getElementById("root");

  if (!rootElement) {
    throw new Error('next2 expected an element with id="root".');
  }

  createRoot(rootElement).render(
    <React.StrictMode>
      <RouterProvider routes={options.routes}>
        <RouteView routes={options.routes} notFoundComponent={options.notFoundComponent} />
      </RouterProvider>
    </React.StrictMode>,
  );
}

export function Link(props: React.AnchorHTMLAttributes<HTMLAnchorElement>): React.ReactElement {
  const router = useRouter();
  const { href, onClick, onMouseEnter, children, ...rest } = props;
  const resolvedHref = href ?? "";

  function handleClick(event: React.MouseEvent<HTMLAnchorElement>): void {
    if (onClick) {
      onClick(event);
    }

    if (event.defaultPrevented || !isLocalHref(resolvedHref) || shouldUseBrowserNavigation(event)) {
      return;
    }

    event.preventDefault();
    router.push(resolvedHref);
  }

  function handleMouseEnter(event: React.MouseEvent<HTMLAnchorElement>): void {
    if (onMouseEnter) {
      onMouseEnter(event);
    }

    if (isLocalHref(resolvedHref)) {
      void router.prefetch(resolvedHref);
    }
  }

  return (
    <a href={resolvedHref} onClick={handleClick} onMouseEnter={handleMouseEnter} {...rest}>
      {children}
    </a>
  );
}

export function useRouter(): RouterApi {
  const router = useContext(RouterContext);

  if (!router) {
    throw new Error("useRouter must be used inside next2's router.");
  }

  return router;
}

export function useParams(): RouteParams {
  return useContext(ParamsContext);
}

export function useSearchParams(): URLSearchParams {
  const router = useRouter();

  return useMemo(
    function createSearchParams() {
      return new URLSearchParams(router.search);
    },
    [router.search],
  );
}

export function RouterProvider(
  props: React.PropsWithChildren<{ routes: GeneratedClientRoute[] }>,
): React.ReactElement {
  const [state, setState] = useState<RouterState>(readLocation);

  useEffect(function bindPopState() {
    function handlePopState(): void {
      setState(readLocation());
    }

    window.addEventListener("popstate", handlePopState);

    return function cleanupPopState() {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  const api = useMemo(
    function createRouterApi(): RouterApi {
      function navigate(href: string, mode: "push" | "replace"): void {
        const url = new URL(href, window.location.href);

        if (mode === "push") {
          window.history.pushState(null, "", url);
        } else {
          window.history.replaceState(null, "", url);
        }

        setState(readLocation());
      }

      async function prefetch(href: string): Promise<void> {
        const url = new URL(href, window.location.href);
        const match = matchRoute(props.routes, url.pathname);

        if (match) {
          await loadRoute(match.route);
        }
      }

      return {
        pathname: state.pathname,
        search: state.search,
        push: function push(href: string) {
          navigate(href, "push");
        },
        replace: function replace(href: string) {
          navigate(href, "replace");
        },
        back: function back() {
          window.history.back();
        },
        forward: function forward() {
          window.history.forward();
        },
        prefetch,
      };
    },
    [props.routes, state.pathname, state.search],
  );

  return <RouterContext.Provider value={api}>{props.children}</RouterContext.Provider>;
}

function RouteView(props: {
  routes: GeneratedClientRoute[];
  notFoundComponent: React.ComponentType | undefined;
}): React.ReactElement {
  const router = useRouter();
  const match = matchRoute(props.routes, router.pathname);
  const matchedRoute = match?.route;
  const stateKey = match ? match.route.id : "__not_found__";
  const [state, setState] = useState<RouteViewState>({ status: "idle" });
  const [resetVersion, setResetVersion] = useState(0);

  useEffect(
    function loadMatchedRoute() {
      let active = true;
      void resetVersion;

      if (!matchedRoute) {
        setState({ status: "ready", routeId: stateKey });
        return function cleanupMissingRoute() {
          active = false;
        };
      }

      setState({
        status: "loading",
        routeId: matchedRoute.id,
      });

      loadRoute(matchedRoute)
        .then(function handleLoadedRoute(loaded) {
          if (!active) {
            return;
          }

          setState({
            status: "ready",
            routeId: matchedRoute.id,
            loaded,
          });
        })
        .catch(function handleLoadError(error) {
          if (!active) {
            return;
          }

          setState({
            status: "error",
            routeId: matchedRoute.id,
            error,
          });
        });

      return function cleanupMatchedRoute() {
        active = false;
      };
    },
    [matchedRoute, resetVersion, stateKey],
  );

  if (!match) {
    const NotFound = props.notFoundComponent ?? DefaultNotFound;
    return <NotFound />;
  }

  if (state.status === "loading" || state.status === "idle") {
    const Loading = match.route.loadingComponent ?? DefaultLoading;
    return <Loading />;
  }

  if (state.status === "error" || !state.loaded) {
    return renderError(match.route, state.error, reset);
  }

  function reset(): void {
    if (matchedRoute) {
      routePreloadCache.delete(matchedRoute.id);
    }

    setResetVersion(function increment(version) {
      return version + 1;
    });
    setState({ status: "idle" });
  }

  const element = composeLayouts(state.loaded);

  return (
    <ParamsContext.Provider value={match.params}>
      <RouteRenderBoundary route={match.route} reset={reset}>
        {element}
      </RouteRenderBoundary>
    </ParamsContext.Provider>
  );
}

class RouteRenderBoundary extends React.Component<
  React.PropsWithChildren<{
    route: GeneratedClientRoute;
    reset: () => void;
  }>,
  { error: unknown | undefined }
> {
  static getDerivedStateFromError(error: unknown): { error: unknown } {
    return { error };
  }

  constructor(
    props: React.PropsWithChildren<{
      route: GeneratedClientRoute;
      reset: () => void;
    }>,
  ) {
    super(props);
    this.state = {
      error: undefined,
    };
  }

  componentDidUpdate(
    previousProps: Readonly<
      React.PropsWithChildren<{
        route: GeneratedClientRoute;
        reset: () => void;
      }>
    >,
  ): void {
    if (previousProps.route.id !== this.props.route.id && this.state.error) {
      this.setState({
        error: undefined,
      });
    }
  }

  render(): React.ReactNode {
    if (this.state.error) {
      return renderError(this.props.route, this.state.error, this.props.reset);
    }

    return this.props.children;
  }
}

function composeLayouts(loaded: LoadedRoute): React.ReactElement {
  let element = <loaded.page />;

  for (let index = loaded.layouts.length - 1; index >= 0; index -= 1) {
    const Layout = loaded.layouts[index];

    if (!Layout) {
      continue;
    }

    element = <Layout>{element}</Layout>;
  }

  return element;
}

function renderError(
  route: GeneratedClientRoute,
  error: unknown,
  reset: () => void,
): React.ReactElement {
  const ErrorComponent = route.errorComponent ?? DefaultError;
  return <ErrorComponent error={error} reset={reset} />;
}

async function loadRoute(route: GeneratedClientRoute): Promise<LoadedRoute> {
  const cached = routePreloadCache.get(route.id);

  if (cached) {
    return cached;
  }

  const promise = Promise.all([route.page(), ...route.layouts.map(loadModule)]).then(
    function createLoadedRoute(modules) {
      const pageModule = modules[0];

      if (!pageModule) {
        throw new Error(`Route "${route.routePath}" did not load a page module.`);
      }

      const layouts = modules.slice(1).map(function mapLayout(module) {
        return module.default as React.ComponentType<React.PropsWithChildren>;
      });

      return {
        id: route.id,
        page: pageModule.default,
        layouts,
      };
    },
  );

  routePreloadCache.set(route.id, promise);
  return promise;
}

function loadModule(loader: RouteModuleLoader): Promise<RouteModule> {
  return loader();
}

function readLocation(): RouterState {
  return {
    pathname: window.location.pathname,
    search: window.location.search,
  };
}

function isLocalHref(href: string): boolean {
  if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
    return false;
  }

  const url = new URL(href, window.location.href);
  return url.origin === window.location.origin;
}

function shouldUseBrowserNavigation(event: React.MouseEvent<HTMLAnchorElement>): boolean {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;
}

function DefaultLoading(): React.ReactElement {
  return <div data-next2-loading="">Loading...</div>;
}

function DefaultNotFound(): React.ReactElement {
  return <h1>Not found</h1>;
}

function DefaultError(props: ErrorViewProps): React.ReactElement {
  const message = props.error instanceof Error ? props.error.message : "Unknown route error";

  return (
    <main role="alert">
      <h1>Route error</h1>
      <pre>{message}</pre>
      <button type="button" onClick={props.reset}>
        Try again
      </button>
    </main>
  );
}
