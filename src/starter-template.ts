export interface StarterTemplate {
  packageName: string;
  files: StarterTemplateFile[];
}

export interface StarterTemplateFile {
  path: string;
  contents: string;
}

export function createStarterTemplate(directoryName: string): StarterTemplate {
  const packageName = createPackageName(directoryName);

  return {
    packageName,
    files: createTemplateFiles(packageName),
  };
}

function createTemplateFiles(packageName: string): StarterTemplateFile[] {
  return [
    {
      path: "package.json",
      contents: `${JSON.stringify(createPackageJson(packageName), null, 2)}\n`,
    },
    {
      path: "tsconfig.json",
      contents: `${JSON.stringify(createTsconfig(), null, 2)}\n`,
    },
    {
      path: ".gitignore",
      contents: ["node_modules", "dist", ".now", ".DS_Store", ""].join("\n"),
    },
    {
      path: "app/layout.tsx",
      contents: `import type { PropsWithChildren } from "react";
import { Link } from "now/client";
import "./styles.css";

export default function RootLayout(props: PropsWithChildren): React.ReactElement {
  return (
    <div className="shell">
      <header className="topbar">
        <Link href="/">now</Link>
        <nav>
          <Link href="/">Home</Link>
          <Link href="/about">About</Link>
        </nav>
      </header>
      {props.children}
    </div>
  );
}
`,
    },
    {
      path: "app/page.tsx",
      contents: `import { useState } from "react";
import { Link } from "now/client";

export default function HomePage(): React.ReactElement {
  const [message, setMessage] = useState("Ready when you are.");

  async function checkServer(): Promise<void> {
    const response = await fetch("/api/health");
    const json = (await response.json()) as { ok: boolean };
    setMessage(json.ok ? "The API route is working." : "Something needs a look.");
  }

  return (
    <main className="stack">
      <section className="hero">
        <p className="eyebrow">now app</p>
        <h1>Build client-first React apps with server routes.</h1>
        <p>
          Edit <code>app/page.tsx</code> and save to reload.
        </p>
        <div className="actions">
          <button type="button" onClick={checkServer}>
            Check API
          </button>
          <Link href="/about">Open about</Link>
        </div>
      </section>
      <output className="status">{message}</output>
    </main>
  );
}
`,
    },
    {
      path: "app/about/page.tsx",
      contents: `import { Link } from "now/client";

export default function AboutPage(): React.ReactElement {
  return (
    <main className="stack">
      <h1>About this app</h1>
      <p>This route lives at <code>app/about/page.tsx</code>.</p>
      <Link href="/">Back home</Link>
    </main>
  );
}
`,
    },
    {
      path: "app/api/health/route.ts",
      contents: `export function GET(): Response {
  return Response.json({
    ok: true,
  });
}
`,
    },
    {
      path: "app/styles.css",
      contents: `body {
  margin: 0;
  color: #18181b;
  background: #f8fafc;
  font-family:
    Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

a {
  color: #0369a1;
  font-weight: 650;
  text-decoration: none;
}

button {
  border: 1px solid #0f766e;
  border-radius: 6px;
  padding: 0.65rem 0.9rem;
  color: white;
  background: #0f766e;
  font: inherit;
  cursor: pointer;
}

code {
  border-radius: 4px;
  padding: 0.1rem 0.25rem;
  background: #e4e4e7;
}

.shell {
  min-height: 100vh;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem 1.25rem;
  background: white;
  border-bottom: 1px solid #e4e4e7;
}

.topbar nav,
.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.85rem;
}

.stack {
  display: grid;
  gap: 1rem;
  max-width: 760px;
  margin: 0 auto;
  padding: 3rem 1.25rem;
}

.hero {
  display: grid;
  gap: 1rem;
}

.hero h1 {
  max-width: 12ch;
  margin: 0;
  font-size: 3rem;
  line-height: 1;
}

.hero p {
  max-width: 36rem;
}

.eyebrow {
  margin: 0;
  color: #0f766e;
  font-weight: 750;
  text-transform: uppercase;
}

.status {
  border: 1px solid #d4d4d8;
  border-radius: 8px;
  padding: 1rem;
  background: white;
}
`,
    },
  ];
}

function createPackageJson(packageName: string): Record<string, unknown> {
  return {
    name: packageName,
    version: "0.1.0",
    private: true,
    type: "module",
    scripts: {
      dev: "now dev",
      build: "now build",
      start: "now start",
      typecheck: "tsc --noEmit",
      verify: "npm run typecheck && npm run build",
    },
    dependencies: {
      now: "latest",
      react: "latest",
      "react-dom": "latest",
    },
    devDependencies: {
      "@types/react": "latest",
      "@types/react-dom": "latest",
      typescript: "latest",
    },
  };
}

function createTsconfig(): Record<string, unknown> {
  return {
    compilerOptions: {
      target: "ES2022",
      lib: ["ES2022", "DOM", "DOM.Iterable"],
      module: "ESNext",
      moduleResolution: "Bundler",
      jsx: "react-jsx",
      strict: true,
      noUncheckedIndexedAccess: true,
      exactOptionalPropertyTypes: true,
      verbatimModuleSyntax: true,
      isolatedModules: true,
      skipLibCheck: true,
      types: ["react", "react-dom"],
    },
    include: ["app"],
  };
}

function createPackageName(directoryName: string): string {
  const packageName = directoryName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 214);

  if (!isValidPackageName(packageName)) {
    return "now-app";
  }

  return packageName;
}

function isValidPackageName(packageName: string): boolean {
  return (
    packageName.length > 0 &&
    packageName !== "node_modules" &&
    packageName !== "favicon.ico" &&
    /^[a-z0-9][a-z0-9._-]*$/.test(packageName)
  );
}
