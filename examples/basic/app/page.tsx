import { useState } from "react";
import { Link } from "now/client";

export default function HomePage(): React.ReactElement {
  const [apiResult, setApiResult] = useState("not called");
  const [rpcResult, setRpcResult] = useState("not called");

  async function callApi(): Promise<void> {
    const response = await fetch("/api/health");
    const json = (await response.json()) as { ok: boolean; runtime: string };
    setApiResult(`${json.ok}:${json.runtime}`);
  }

  async function callRpc(): Promise<void> {
    const response = await fetch("/api/rpc/hello");
    const json = (await response.json()) as { rpc: boolean; path: string };
    setRpcResult(`${json.rpc}:${json.path}`);
  }

  return (
    <main className="stack">
      <section className="panel" data-testid="home-page">
        <h1>Client-first routes, server APIs</h1>
        <p>This page is rendered in the browser and talks to server-side handlers.</p>
        <p>
          <Link href="/blog/launch">Open a dynamic route</Link>
        </p>
      </section>

      <section className="panel stack">
        <button type="button" onClick={callApi}>
          Call health route
        </button>
        <output data-testid="api-result">{apiResult}</output>
      </section>

      <section className="panel stack">
        <button type="button" onClick={callRpc}>
          Call RPC route
        </button>
        <output data-testid="rpc-result">{rpcResult}</output>
      </section>
    </main>
  );
}
