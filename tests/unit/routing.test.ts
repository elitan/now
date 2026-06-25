import { describe, expect, it, afterEach } from "vitest";
import { matchRoute } from "../../src/routing/matcher";
import { scanApiRoutes, scanClientRoutes } from "../../src/routing/scanner";
import { createTempProject, removeTempProject, writeProjectFile } from "../helpers/fixtures";

const tempProjects: string[] = [];

afterEach(function cleanupProjects() {
  for (const project of tempProjects) {
    removeTempProject(project);
  }

  tempProjects.length = 0;
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

    expect(paths).toEqual(expect.arrayContaining(["/", "/blog/:slug", "/docs/*slug", "/about"]));
    expect(blogRoute?.layouts).toHaveLength(2);
  });

  it("scans dynamic and catch-all API routes", function scanApi() {
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
      "app/api/search/[[...terms]]/route.ts",
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
        "/api/search/*terms?",
      ]),
    );
  });

  it("rejects client pages inside app/api", function rejectApiClientPage() {
    const root = createTempProject();
    tempProjects.push(root);

    writeProjectFile(
      root,
      "app/api/users/page.tsx",
      "export default function Page(){ return null }",
    );

    expect(function scanRoutes() {
      scanApiRoutes(root);
    }).toThrowError(/app\/api is reserved for server route\.ts files/);
  });

  it("rejects catch-all route segments before the end", function rejectInvalidCatchAll() {
    const root = createTempProject();
    tempProjects.push(root);

    writeProjectFile(
      root,
      "app/api/files/[...path]/meta/route.ts",
      "export function GET(){ return new Response() }",
    );

    expect(function scanRoutes() {
      scanApiRoutes(root);
    }).toThrowError(/must be the last segment/);
  });

  it("rejects duplicate API route URL shapes", function rejectDuplicateApiShape() {
    const root = createTempProject();
    tempProjects.push(root);

    writeProjectFile(
      root,
      "app/api/(one)/users/[id]/route.ts",
      "export function GET(){ return new Response() }",
    );
    writeProjectFile(
      root,
      "app/api/(two)/users/[userId]/route.ts",
      "export function GET(){ return new Response() }",
    );

    expect(function scanRoutes() {
      scanApiRoutes(root);
    }).toThrowError(/Conflicting API routes/);
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

  it("matches optional catch-all params with and without segments", function optionalCatchAll() {
    const root = createTempProject();
    tempProjects.push(root);

    writeProjectFile(
      root,
      "app/search/[[...terms]]/page.tsx",
      "export default function Page(){ return null }",
    );

    const routes = scanClientRoutes(root);
    const baseMatch = matchRoute(routes, "/search");
    const nestedMatch = matchRoute(routes, "/search/design/systems");

    expect(baseMatch?.params.terms).toBeUndefined();
    expect(nestedMatch?.params.terms).toEqual(["design", "systems"]);
  });
});
