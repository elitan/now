import type { PropsWithChildren } from "react";
import { Link } from "now/client";
import "./styles.css";

export default function RootLayout(props: PropsWithChildren): React.ReactElement {
  return (
    <div className="shell">
      <header className="topbar" data-testid="root-layout">
        <strong>now example</strong>
        <nav>
          <Link href="/">Home</Link>
          <Link href="/about?q=search">About</Link>
          <Link href="/campaign">Campaign</Link>
          <Link href="/blog/alpha">Blog alpha</Link>
          <Link href="/docs">Docs index</Link>
          <Link href="/docs/guide/getting-started">Docs guide</Link>
          <Link href="/broken">Broken</Link>
        </nav>
      </header>
      <section className="content">{props.children}</section>
    </div>
  );
}
