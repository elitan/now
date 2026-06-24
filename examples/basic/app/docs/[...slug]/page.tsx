import { useParams } from "now/client";

export default function DocsPage(): React.ReactElement {
  const params = useParams();
  const slug = Array.isArray(params.slug) ? params.slug.join("/") : String(params.slug);

  return (
    <main className="panel" data-testid="docs-page">
      <h1>Docs</h1>
      <p data-testid="docs-slug">{slug}</p>
    </main>
  );
}
