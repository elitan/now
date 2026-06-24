import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { toViteFsPath } from "./paths";

export interface GeneratedClientFiles {
  directory: string;
  entry: string;
  html: string;
}

export async function writeGeneratedClientFiles(
  projectRoot: string,
  clientRuntimePath: string,
): Promise<GeneratedClientFiles> {
  const directory = join(projectRoot, ".now", "generated");
  const entry = join(directory, "client-entry.tsx");
  const html = join(directory, "index.html");

  await mkdir(directory, { recursive: true });
  await writeFile(entry, createClientEntry(clientRuntimePath), "utf8");
  await writeFile(html, createHtml(), "utf8");

  return {
    directory,
    entry,
    html,
  };
}

function createClientEntry(clientRuntimePath: string): string {
  return [
    `import { boot } from "${toViteFsPath(clientRuntimePath)}";`,
    'import { notFoundComponent, routes } from "virtual:now/routes";',
    "",
    "boot({",
    "  routes,",
    "  notFoundComponent",
    "});",
    "",
  ].join("\n");
}

function createHtml(): string {
  return [
    "<!doctype html>",
    '<html lang="en">',
    "  <head>",
    '    <meta charset="UTF-8" />',
    '    <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    "    <title>now app</title>",
    "  </head>",
    "  <body>",
    '    <div id="root"></div>',
    '    <script type="module" src="/.now/generated/client-entry.tsx"></script>',
    "  </body>",
    "</html>",
    "",
  ].join("\n");
}
