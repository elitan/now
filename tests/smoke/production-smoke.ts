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
  const pageResponse = await fetch(`${baseUrl}/blog/smoke`);
  const pageText = await pageResponse.text();

  if (!healthJson.ok) {
    throw new Error("Production health API did not return ok=true.");
  }

  if (!pageText.includes('<div id="root"></div>')) {
    throw new Error("Production SPA fallback did not return the app HTML.");
  }
} finally {
  await server.close();
}
