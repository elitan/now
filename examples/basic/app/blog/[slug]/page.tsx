import { useParams } from "next2/client";

export default function BlogPostPage(): React.ReactElement {
  const params = useParams();

  return (
    <main className="panel" data-testid="blog-page">
      <h1>Blog post</h1>
      <p data-testid="blog-slug">{String(params.slug)}</p>
    </main>
  );
}
