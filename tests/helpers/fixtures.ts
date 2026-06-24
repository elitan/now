import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function createTempProject(): string {
  const root = join(tmpdir(), `now-test-${process.pid}-${Date.now()}`);

  mkdirSync(root, {
    recursive: true,
  });

  return root;
}

export function writeProjectFile(root: string, file: string, contents: string): void {
  const target = join(root, file);
  const directory = target.slice(0, target.lastIndexOf("/"));

  mkdirSync(directory, {
    recursive: true,
  });
  writeFileSync(target, contents, "utf8");
}

export function removeTempProject(root: string): void {
  rmSync(root, {
    recursive: true,
    force: true,
  });
}
