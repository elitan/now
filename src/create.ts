import { existsSync } from "node:fs";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { createStarterTemplate } from "./starter-template";

export interface CreateProjectResult {
  root: string;
  packageName: string;
  files: string[];
}

export async function createProject(targetDirectory: string): Promise<CreateProjectResult> {
  const root = resolve(targetDirectory);
  const template = createStarterTemplate(basename(root));

  await prepareTargetDirectory(root);

  for (const file of template.files) {
    const target = join(root, file.path);
    await mkdir(dirname(target), {
      recursive: true,
    });
    await writeFile(target, file.contents, "utf8");
  }

  return {
    root,
    packageName: template.packageName,
    files: template.files.map(function mapFile(file) {
      return file.path;
    }),
  };
}

async function prepareTargetDirectory(root: string): Promise<void> {
  if (!existsSync(root)) {
    await mkdir(root, {
      recursive: true,
    });
    return;
  }

  const entries = await readdir(root);

  if (entries.length > 0) {
    throw new Error(`Target directory is not empty: ${root}. Choose an empty directory.`);
  }
}
