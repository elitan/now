import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createProject } from "../../src/create";
import { scanApiRoutes, scanClientRoutes } from "../../src/routing/scanner";
import { buildProject } from "../../src/server/build";
import { createProductionFetchHandler } from "../../src/server/prod";
import { createTempProject, removeTempProject } from "../helpers/fixtures";

describe("createProject", function createProjectSuite() {
  const roots: string[] = [];

  afterEach(function cleanupProjects() {
    for (const root of roots) {
      removeTempProject(root);
    }
    roots.length = 0;
  });

  it("creates a starter now app", async function createsStarterApp() {
    const parent = createTrackedTempProject(roots);
    const projectRoot = join(parent, "Hello Now");

    const result = await createProject(projectRoot);
    const packageJson = JSON.parse(readFileSync(join(projectRoot, "package.json"), "utf8")) as {
      name: string;
      scripts: Record<string, string>;
    };
    const clientRoutes = scanClientRoutes(projectRoot);
    const apiRoutes = scanApiRoutes(projectRoot);

    expect(result.packageName).toBe("hello-now");
    expect(result.files).toContain("app/page.tsx");
    expect(packageJson.name).toBe("hello-now");
    expect(packageJson.scripts.dev).toBe("now dev");
    expect(
      clientRoutes
        .map(function mapRoute(route) {
          return route.routePath;
        })
        .sort(),
    ).toEqual(["/", "/about"]);
    expect(
      apiRoutes.map(function mapRoute(route) {
        return route.routePath;
      }),
    ).toEqual(["/api/health"]);
  });

  it("refuses to overwrite a non-empty directory by default", async function refusesOverwrite() {
    const parent = createTrackedTempProject(roots);
    const projectRoot = join(parent, "app");
    mkdirSync(projectRoot);
    writeFileSync(join(projectRoot, "README.md"), "existing", "utf8");

    await expect(createProject(projectRoot)).rejects.toThrow(
      `Target directory is not empty: ${projectRoot}. Choose an empty directory.`,
    );
  });

  it("builds the generated starter app", async function buildsStarterApp() {
    const parent = createTrackedTempProject(roots);
    const projectRoot = join(parent, "starter");

    await createProject(projectRoot);
    symlinkSync(resolve("node_modules"), join(projectRoot, "node_modules"), "dir");
    await buildProject(projectRoot);
    const handler = await createProductionFetchHandler(projectRoot);
    const response = await handler(new Request("http://test.local/api/health"));
    const json = (await response.json()) as { ok: boolean };

    expect(existsSync(join(projectRoot, "dist", "client", "index.html"))).toBe(true);
    expect(json.ok).toBe(true);
  });
});

function createTrackedTempProject(roots: string[]): string {
  const root = createTempProject();
  roots.push(root);
  return root;
}
