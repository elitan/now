import { existsSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { join, resolve } from "node:path";

const bunVersion = spawnSync("bun", ["--version"], {
  stdio: "pipe",
});

if (bunVersion.status !== 0) {
  console.log("Bun is not available; skipping Bun smoke test.");
  process.exit(0);
}

const root = process.cwd();
const cli = resolve(root, "dist", "cli.js");

if (!existsSync(cli)) {
  console.log("Built CLI is not available; skipping Bun smoke test.");
  process.exit(0);
}

if (!existsSync(join(root, "examples", "basic", "dist", "server", "manifest.json"))) {
  console.log("Example production build is not available; skipping Bun smoke test.");
  process.exit(0);
}

const port = 4299;
const child = spawn("bun", [cli, "start", "examples/basic", "--port", String(port)], {
  cwd: root,
  stdio: ["ignore", "pipe", "pipe"],
});

try {
  await waitForServer(port);
  const response = await fetch(`http://127.0.0.1:${port}/api/health`);
  const json = (await response.json()) as { ok: boolean };

  if (!json.ok) {
    throw new Error("Bun runtime did not serve the API route.");
  }
} finally {
  child.kill("SIGTERM");
}

async function waitForServer(port: number): Promise<void> {
  const deadline = Date.now() + 15_000;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);

      if (response.ok) {
        return;
      }
    } catch {
      await sleep(250);
    }
  }

  throw new Error("Timed out waiting for Bun server.");
}

function sleep(ms: number): Promise<void> {
  return new Promise(function resolveLater(resolveSleep) {
    setTimeout(resolveSleep, ms);
  });
}
