import { Link } from "next2/client";

export default function NotFound(): React.ReactElement {
  return (
    <main className="panel" data-testid="not-found-view">
      <h1>Nothing here</h1>
      <Link href="/">Go home</Link>
    </main>
  );
}
