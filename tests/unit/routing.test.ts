import { describe, expect, it, afterEach } from "vitest";
import { matchRoute, rankRoutes } from "../../src/routing/matcher";
import { scanApiRoutes, scanClientRoutes } from "../../src/routing/scanner";
import { parseRouteSegments, routePathFromSegments } from "../../src/routing/segments";
import { createTempProject, removeTempProject, writeProjectFile } from "../helpers/fixtures";

const tempProjects: string[] = [];

afterEach(function cleanupProjects() {
  for (const project of tempProjects) {
    removeTempProject(project);
  }

  tempProjects.length = 0;
});

describe("route segment parsing", function routeSegmentParsingSuite() {
  it("parses optional catch-all segments", function parseOptionalCatchAll() {
    const segments = parseRouteSegments(["docs", "[[...slug]]"]);

    expect(segments).toEqual([
      {
        kind: "static",
        value: "docs",
      },
      {
        kind: "optionalCatchAll",
        value: "[[...slug]]",
        param: "slug",
      },
    ]);
    expect(routePathFromSegments(segments)).toBe("/docs/*slug?");
  });

  it("rejects invalid optional catch-all params", function rejectInvalidOptionalCatchAll() {
    expect(function parseEmptyParam() {
      parseRouteSegments(["[[...]]"]);
    }).toThrow('Invalid route segment "[[...]]".');
  });

  it("rejects non-terminal catch-all segments", function rejectNonTerminalCatchAll() {
    expect(function parseCatchAllBeforeStatic() {
      parseRouteSegments(["docs", "[...slug]", "edit"]);
    }).toThrow('Catch-all route segment "[...slug]" must be the final route segment.');

    expect(function parseOptionalCatchAllBeforeStatic() {
      parseRouteSegments(["docs", "[[...slug]]", "edit"]);
    }).toThrow('Catch-all route segment "[[...slug]]" must be the final route segment.');
  });
});

describe("file route scanning", function routeScanningSuite() {
  it("scans static, dynamic, catch-all, and nested layout routes", function scanRoutes() {
    const root = createTempProject();
    tempProjects.push(root);

    writeProjectFile(root, "app/layout.tsx", "export default function Layout(){ return null }");
    writeProjectFile(root, "app/page.tsx", "export default function Page(){ return null }");
    writeProjectFile(
      root,
      "app/blog/layout.tsx",
      "export default function Layout(){ return null }",
    );
    writeProjectFile(
      root,
      "app/blog/[slug]/page.tsx",
      "export default function Page(){ return null }",
    );
    writeProjectFile(
      root,
      "app/docs/[...slug]/page.tsx",
      "export default function Page(){ return null }",
    );
    writeProjectFile(
      root,
      "app/shop/[[...slug]]/page.tsx",
      "export default function Page(){ return null }",
    );
    writeProjectFile(
      root,
      "app/(group)/about/page.tsx",
      "export default function Page(){ return null }",
    );

    const routes = scanClientRoutes(root);
    const paths = routes.map(function mapRoute(route) {
      return route.routePath;
    });
    const blogRoute = routes.find(function findBlog(route) {
      return route.routePath === "/blog/:slug";
    });

    expect(paths).toEqual(
      expect.arrayContaining(["/", "/blog/:slug", "/docs/*slug", "/shop/*slug?", "/about"]),
    );
    expect(blogRoute?.layouts).toHaveLength(2);
  });

  it("scans dynamic, catch-all, and optional catch-all API routes", function scanApi() {
    const root = createTempProject();
    tempProjects.push(root);

    writeProjectFile(
      root,
      "app/api/health/route.ts",
      "export function GET(){ return new Response() }",
    );
    writeProjectFile(
      root,
      "app/api/users/[id]/route.ts",
      "export function GET(){ return new Response() }",
    );
    writeProjectFile(
      root,
      "app/api/files/[...path]/route.ts",
      "export function GET(){ return new Response() }",
    );
    writeProjectFile(
      root,
      "app/api/docs/[[...path]]/route.ts",
      "export function GET(){ return new Response() }",
    );

    const routes = scanApiRoutes(root);
    const paths = routes.map(function mapRoute(route) {
      return route.routePath;
    });

    expect(paths).toEqual(
      expect.arrayContaining([
        "/api/health",
        "/api/users/:id",
        "/api/files/*path",
        "/api/docs/*path?",
      ]),
    );
  });
});

describe("route matching", function routeMatchingSuite() {
  it("ranks static routes before dynamic and catch-all routes", function rankRoutes() {
    const root = createTempProject();
    tempProjects.push(root);

    writeProjectFile(
      root,
      "app/blog/[slug]/page.tsx",
      "export default function Page(){ return null }",
    );
    writeProjectFile(
      root,
      "app/blog/settings/page.tsx",
      "export default function Page(){ return null }",
    );
    writeProjectFile(
      root,
      "app/blog/[...slug]/page.tsx",
      "export default function Page(){ return null }",
    );

    const routes = scanClientRoutes(root);
    const staticMatch = matchRoute(routes, "/blog/settings");
    const dynamicMatch = matchRoute(routes, "/blog/hello");
    const catchAllMatch = matchRoute(routes, "/blog/a/b");

    expect(staticMatch?.route.routePath).toBe("/blog/settings");
    expect(dynamicMatch?.params.slug).toBe("hello");
    expect(catchAllMatch?.params.slug).toEqual(["a", "b"]);
  });

  it("matches optional catch-all base and nested paths", function optionalCatchAllRoute() {
    const root = createTempProject();
    tempProjects.push(root);

    writeProjectFile(
      root,
      "app/shop/[[...slug]]/page.tsx",
      "export default function Page(){ return null }",
    );

    const routes = scanClientRoutes(root);
    const baseMatch = matchRoute(routes, "/shop");
    const nestedMatch = matchRoute(routes, "/shop/a/b");

    expect(baseMatch?.route.routePath).toBe("/shop/*slug?");
    expect(baseMatch?.params.slug).toEqual([]);
    expect(nestedMatch?.params.slug).toEqual(["a", "b"]);
  });

  it("normalizes optional catch-all paths before matching", function optionalCatchAllNormalization() {
    const routes = [
      {
        id: "shop-optional-catch-all-slug-page",
        routePath: "/shop/*slug?",
        segments: parseRouteSegments(["shop", "[[...slug]]"]),
      },
    ];

    expect(matchRoute(routes, "/shop/")?.params.slug).toEqual([]);
    expect(matchRoute(routes, "/shop?view=grid")?.params.slug).toEqual([]);
    expect(matchRoute(routes, "//shop//a%20b/%E2%9C%93//")?.params.slug).toEqual(["a b", "\u2713"]);
  });

  it("keeps optional catch-all below more specific routes", function optionalCatchAllPrecedence() {
    const root = createTempProject();
    tempProjects.push(root);

    writeProjectFile(root, "app/shop/page.tsx", "export default function Page(){ return null }");
    writeProjectFile(
      root,
      "app/shop/cart/page.tsx",
      "export default function Page(){ return null }",
    );
    writeProjectFile(
      root,
      "app/shop/[id]/page.tsx",
      "export default function Page(){ return null }",
    );
    writeProjectFile(
      root,
      "app/shop/[...slug]/page.tsx",
      "export default function Page(){ return null }",
    );
    writeProjectFile(
      root,
      "app/shop/[[...slug]]/page.tsx",
      "export default function Page(){ return null }",
    );

    const routes = scanClientRoutes(root);
    const ids = routes.map(function mapId(route) {
      return route.id;
    });
    const uniqueIds = new Set(ids);

    expect(uniqueIds.size).toBe(ids.length);
    expect(matchRoute(routes, "/shop")?.route.routePath).toBe("/shop");
    expect(matchRoute(routes, "/shop/cart")?.route.routePath).toBe("/shop/cart");
    expect(matchRoute(routes, "/shop/alpha")?.route.routePath).toBe("/shop/:id");
    expect(matchRoute(routes, "/shop/a/b")?.route.routePath).toBe("/shop/*slug");
  });

  it("ranks catch-all before optional catch-all for nested paths", function catchAllPrecedence() {
    const routes = [
      {
        id: "optional",
        routePath: "/shop/*slug?",
        segments: parseRouteSegments(["shop", "[[...slug]]"]),
      },
      {
        id: "catch-all",
        routePath: "/shop/*slug",
        segments: parseRouteSegments(["shop", "[...slug]"]),
      },
    ];
    const rankedRoutes = rankRoutes(routes);

    expect(
      rankedRoutes.map(function mapRoute(route) {
        return route.id;
      }),
    ).toEqual(["catch-all", "optional"]);
    expect(matchRoute(routes, "/shop")?.route.id).toBe("optional");
    expect(matchRoute(routes, "/shop/a")?.route.id).toBe("catch-all");
    expect(matchRoute(routes, "/shop/a/b")?.route.id).toBe("catch-all");
  });

  it("ranks static prefixes before higher-scoring dynamic routes", function staticPrefixPrecedence() {
    const routes = [
      {
        id: "static-optional",
        routePath: "/static/*slug?",
        segments: parseRouteSegments(["static", "[[...slug]]"]),
      },
      {
        id: "dynamic-dynamic",
        routePath: "/:category/:id",
        segments: parseRouteSegments(["[category]", "[id]"]),
      },
    ];
    const rankedRoutes = rankRoutes(routes);
    const match = matchRoute(routes, "/static/foo");

    expect(
      rankedRoutes.map(function mapRoute(route) {
        return route.id;
      }),
    ).toEqual(["static-optional", "dynamic-dynamic"]);
    expect(match?.route.id).toBe("static-optional");
    expect(match?.params.slug).toEqual(["foo"]);
  });
});
