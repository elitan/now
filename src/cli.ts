#!/usr/bin/env node
import { relative, resolve, sep } from "node:path";
import { createProject } from "./create";
import { buildProject } from "./server/build";
import { startDevServer } from "./server/dev";
import { startProductionServer, type StartOptions } from "./server/prod";

interface ParsedArgs {
  command: string;
  root: string;
  startOptions: StartOptions;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.command === "create") {
    const result = await createProject(args.root);
    printCreateSummary(result.root);
    return;
  }

  if (args.command === "dev") {
    const server = await startDevServer(args.root, args.startOptions);
    console.log(`now dev server listening on http://127.0.0.1:${server.port}`);
    bindShutdown(server.close);
    return;
  }

  if (args.command === "build") {
    await buildProject(args.root);
    console.log("now build complete");
    return;
  }

  if (args.command === "start") {
    const server = await startProductionServer(args.root, args.startOptions);
    console.log(`now production server listening on http://127.0.0.1:${server.port}`);
    bindShutdown(server.close);
    return;
  }

  printHelp();
  process.exit(args.command === "help" ? 0 : 1);
}

function parseArgs(rawArgs: string[]): ParsedArgs {
  const command = rawArgs[0] ?? "help";

  switch (command) {
    case "create":
      return parseRootCommand("create", rawArgs.slice(1), "my-now-app");
    case "build":
      return parseRootCommand("build", rawArgs.slice(1), process.cwd());
    case "dev":
    case "start":
      return parseServeArgs(command, rawArgs.slice(1));
    default:
      return {
        command,
        root: process.cwd(),
        startOptions: {},
      };
  }
}

function parseServeArgs(command: string, rawArgs: string[]): ParsedArgs {
  let root = process.cwd();
  let hasRoot = false;
  const startOptions: StartOptions = {};

  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];

    if (arg === "--port") {
      startOptions.port = parsePort(readOptionValue("--port", rawArgs, index));
      index += 1;
      continue;
    }

    if (arg === "--hostname") {
      startOptions.hostname = readOptionValue("--hostname", rawArgs, index);
      index += 1;
      continue;
    }

    if (arg?.startsWith("--")) {
      throw new Error(`Unknown option for now ${command}: ${arg}`);
    }

    if (arg) {
      if (hasRoot) {
        throw new Error(`now ${command} accepts only one root directory.`);
      }

      root = resolve(arg);
      hasRoot = true;
    }
  }

  return {
    command,
    root,
    startOptions,
  };
}

function parseRootCommand(command: string, rawArgs: string[], defaultRoot: string): ParsedArgs {
  let root = resolve(defaultRoot);
  let hasRoot = false;

  for (const arg of rawArgs) {
    if (arg.startsWith("--")) {
      throw new Error(`Unknown option for now ${command}: ${arg}`);
    }

    if (hasRoot) {
      throw new Error(`now ${command} accepts only one directory.`);
    }

    root = resolve(arg);
    hasRoot = true;
  }

  return {
    command,
    root,
    startOptions: {},
  };
}

function readOptionValue(option: string, rawArgs: string[], index: number): string {
  const value = rawArgs[index + 1];

  if (!value || value.startsWith("--")) {
    throw new Error(`${option} requires a value.`);
  }

  return value;
}

function parsePort(value: string): number {
  const port = Number(value);

  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error("--port must be an integer between 0 and 65535.");
  }

  return port;
}

function bindShutdown(close: () => Promise<void>): void {
  async function shutdown(): Promise<void> {
    await close();
    process.exit(0);
  }

  process.once("SIGINT", function handleSigint() {
    void shutdown();
  });
  process.once("SIGTERM", function handleSigterm() {
    void shutdown();
  });
}

function printHelp(): void {
  console.log("Usage:");
  console.log("  now create [directory]");
  console.log("  now dev [root] --port 3000");
  console.log("  now build [root]");
  console.log("  now start [root] --port 3000");
}

function printCreateSummary(root: string): void {
  const displayPath = formatDisplayPath(root);

  console.log(`Created now app in ${displayPath}`);
  console.log("");
  console.log("Next steps:");

  if (displayPath !== ".") {
    console.log(`  cd ${formatShellValue(displayPath)}`);
  }

  console.log("  npm install");
  console.log("  npm run dev");
}

function formatDisplayPath(root: string): string {
  const relativePath = relative(process.cwd(), root) || ".";

  if (relativePath === ".." || relativePath.startsWith(`..${sep}`)) {
    return root;
  }

  return relativePath;
}

function formatShellValue(value: string): string {
  if (/^[a-zA-Z0-9_./-]+$/.test(value)) {
    return value;
  }

  return `'${value.replaceAll("'", "'\\''")}'`;
}

main().catch(function handleError(error) {
  console.error(error);
  process.exit(1);
});
