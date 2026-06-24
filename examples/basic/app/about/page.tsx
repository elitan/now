import { useRouter, useSearchParams } from "next2/client";

export default function AboutPage(): React.ReactElement {
  const router = useRouter();
  const searchParams = useSearchParams();

  function navigateHome(): void {
    router.push("/");
  }

  return (
    <main className="panel" data-testid="about-page">
      <h1>About</h1>
      <p data-testid="search-value">{searchParams.get("q") ?? "none"}</p>
      <button type="button" onClick={navigateHome}>
        Back home
      </button>
    </main>
  );
}
