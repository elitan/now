import type { PropsWithChildren } from "react";

export default function BlogLayout(props: PropsWithChildren): React.ReactElement {
  return (
    <div className="blog-layout" data-testid="blog-layout">
      <p>Blog layout wraps nested blog pages.</p>
      {props.children}
    </div>
  );
}
