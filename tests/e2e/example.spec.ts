import { expect, test } from "@playwright/test";

test("loads the home page and calls API/RPC handlers", async function homePage({ page }) {
  await page.goto("/");
  await expect(page.getByTestId("root-layout")).toBeVisible();
  await expect(page.getByTestId("home-page")).toBeVisible();

  await page.getByRole("button", { name: "Call health route" }).click();
  await expect(page.getByTestId("api-result")).toHaveText("true:server");

  await page.getByRole("button", { name: "Call RPC route" }).click();
  await expect(page.getByTestId("rpc-result")).toHaveText("true:/api/rpc/hello");
});

test("navigates with search params and client history", async function aboutNavigation({ page }) {
  await page.goto("/");
  await page.getByRole("link", { name: "About" }).click();

  await expect(page).toHaveURL(/\/about\?q=search/);
  await expect(page.getByTestId("about-page")).toBeVisible();
  await expect(page.getByTestId("search-value")).toHaveText("search");

  await page.getByRole("button", { name: "Back home" }).click();
  await expect(page.getByTestId("home-page")).toBeVisible();
});

test("renders dynamic routes and nested layouts", async function dynamicRoute({ page }) {
  await page.goto("/blog/alpha");

  await expect(page.getByTestId("root-layout")).toBeVisible();
  await expect(page.getByTestId("blog-layout")).toBeVisible();
  await expect(page.getByTestId("blog-slug")).toHaveText("alpha");
});

test("handles optional catch-all routes on hard refresh", async function catchAllRoute({ page }) {
  await page.goto("/docs");

  await expect(page.getByTestId("docs-page")).toBeVisible();
  await expect(page.getByTestId("docs-slug")).toHaveText("index");

  await page.goto("/docs/guide/getting-started");

  await expect(page.getByTestId("docs-page")).toBeVisible();
  await expect(page.getByTestId("docs-slug")).toHaveText("guide/getting-started");
});

test("navigates to optional catch-all routes on the client", async function optionalCatchAllNavigation({
  page,
}) {
  await page.goto("/");
  await page.getByRole("link", { name: "Docs index" }).click();

  await expect(page).toHaveURL(/\/docs$/);
  await expect(page.getByTestId("docs-slug")).toHaveText("index");

  await page.getByRole("link", { name: "Docs guide" }).click();
  await expect(page).toHaveURL(/\/docs\/guide\/getting-started$/);
  await expect(page.getByTestId("docs-slug")).toHaveText("guide/getting-started");
});

test("renders not-found and error conventions", async function errorAndNotFound({ page }) {
  await page.goto("/missing/route");
  await expect(page.getByTestId("not-found-view")).toBeVisible();

  await page.goto("/broken");
  await expect(page.getByTestId("error-view")).toBeVisible();
  await expect(page.getByText("Intentional example route failure")).toBeVisible();
});

test("serves dynamic and catch-all API routes in production", async function apiRoutes({
  request,
}) {
  const userResponse = await request.get("/api/users/42");
  const userJson = (await userResponse.json()) as { id: string };
  const filesBaseResponse = await request.get("/api/files");
  const filesResponse = await request.get("/api/files/a/b/c");
  const rpcResponse = await request.post("/api/rpc/e2e");
  const filesBaseJson = (await filesBaseResponse.json()) as { path: string[] };
  const filesJson = (await filesResponse.json()) as { path: string[] };
  const rpcJson = (await rpcResponse.json()) as { rpc: boolean; path: string; params: string[] };

  expect(userJson.id).toBe("42");
  expect(filesBaseJson.path).toEqual([]);
  expect(filesJson.path).toEqual(["a", "b", "c"]);
  expect(rpcJson).toEqual({
    rpc: true,
    path: "/api/rpc/e2e",
    params: ["e2e"],
  });
});
