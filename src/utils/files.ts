import { readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

export function scanFiles(root: string): string[] {
  const absoluteRoot = resolve(root);
  const files: string[] = [];
  walk(absoluteRoot, files);
  return files;
}

function walk(directory: string, files: string[]): void {
  let entries: string[];

  try {
    entries = readdirSync(directory);
  } catch {
    return;
  }

  for (const entry of entries) {
    if (shouldSkipEntry(entry)) {
      continue;
    }

    const file = join(directory, entry);
    const stat = statSync(file);

    if (stat.isDirectory()) {
      walk(file, files);
      continue;
    }

    if (stat.isFile()) {
      files.push(file);
    }
  }
}

function shouldSkipEntry(entry: string): boolean {
  return (
    entry === "node_modules" ||
    entry === ".git" ||
    entry === "dist" ||
    entry === ".next2" ||
    entry === ".research" ||
    entry === "coverage" ||
    entry === "playwright-report" ||
    entry === "test-results"
  );
}
