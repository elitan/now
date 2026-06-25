import { buildProject } from "../../src/server/build";
import { startProductionServer } from "../../src/server/prod";

const exampleRoot = "examples/basic";

await buildProject(exampleRoot);

const server = await startProductionServer(exampleRoot, {
  port: 0,
});

try {
  const baseUrl = `http://127.0.0.1:${server.port}`;
  const healthResponse = await fetch(`${baseUrl}/api/health`);
  const healthJson = (await healthResponse.json()) as { ok: boolean };
  const filesResponse = await fetch(`${baseUrl}/api/files`);
  const filesJson = (await filesResponse.json()) as { path: string[] };
  const pageResponse = await fetch(`${baseUrl}/blog/smoke`);
  const docsResponse = await fetch(`${baseUrl}/docs`);
  const pageText = await pageResponse.text();
  const docsText = await docsResponse.text();

  if (!healthJson.ok) {
    throw new Error("Production health API did not return ok=true.");
  }

  if (filesJson.path.length !== 0) {
    throw new Error("Production optional catch-all API route did not return an empty path.");
  }

  if (!pageText.includes('<div id="root"></div>')) {
    throw new Error("Production SPA fallback did not return the app HTML.");
  }

  if (!docsText.includes('<div id="root"></div>')) {
    throw new Error("Production optional catch-all page route did not return the app HTML.");
  }
} finally {
  await server.close();
}
