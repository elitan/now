#!/usr/bin/env node
import { resolve } from "node:path";
import { buildProject } from "./server/build";
import { startDevServer } from "./server/dev";
import { startProductionServer, type StartOptions } from "./server/prod";

interface ParsedArgs {
  command: string;
  root: string;
  options: StartOptions;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.command === "dev") {
    const server = await startDevServer(args.root, args.options);
    console.log(`next2 dev server listening on http://127.0.0.1:${server.port}`);
    bindShutdown(server.close);
    return;
  }

  if (args.command === "build") {
    await buildProject(args.root);
    console.log("next2 build complete");
    return;
  }

  if (args.command === "start") {
    const server = await startProductionServer(args.root, args.options);
    console.log(`next2 production server listening on http://127.0.0.1:${server.port}`);
    bindShutdown(server.close);
    return;
  }

  printHelp();
  process.exit(args.command === "help" ? 0 : 1);
}

function parseArgs(rawArgs: string[]): ParsedArgs {
  const command = rawArgs[0] ?? "help";
  let root = process.cwd();
  const options: StartOptions = {};

  for (let index = 1; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];

    if (arg === "--port") {
      const value = rawArgs[index + 1];
      if (!value) {
        throw new Error("--port requires a value.");
      }
      options.port = Number(value);
      index += 1;
      continue;
    }

    if (arg === "--hostname") {
      const value = rawArgs[index + 1];
      if (!value) {
        throw new Error("--hostname requires a value.");
      }
      options.hostname = value;
      index += 1;
      continue;
    }

    if (arg && !arg.startsWith("--")) {
      root = resolve(arg);
    }
  }

  return {
    command,
    root,
    options,
  };
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
  console.log("  next2 dev [root] --port 3000");
  console.log("  next2 build [root]");
  console.log("  next2 start [root] --port 3000");
}

main().catch(function handleError(error) {
  console.error(error);
  process.exit(1);
});
