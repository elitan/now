import type { ErrorViewProps } from "next2/client";

export default function ErrorView(props: ErrorViewProps): React.ReactElement {
  const message = props.error instanceof Error ? props.error.message : "Unknown error";

  return (
    <main className="panel" data-testid="error-view" role="alert">
      <h1>Example error boundary</h1>
      <p>{message}</p>
      <button type="button" onClick={props.reset}>
        Reset
      </button>
    </main>
  );
}
