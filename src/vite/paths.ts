import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function toViteFsPath(filePath: string): string {
  return `/@fs/${normalizePath(resolve(filePath))}`;
}

export function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

export function resolveRuntimeFile(relativeCandidates: string[]): string {
  const currentDirectory = dirname(fileURLToPath(import.meta.url));

  for (const candidate of relativeCandidates) {
    const file = resolve(currentDirectory, candidate);

    if (existsSync(file)) {
      return file;
    }
  }

  throw new Error(`Unable to resolve runtime file from ${currentDirectory}.`);
}
