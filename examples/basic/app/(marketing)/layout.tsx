import type { PropsWithChildren } from "react";

export default function MarketingLayout(props: PropsWithChildren): React.ReactElement {
  return (
    <section className="marketing-layout" data-testid="marketing-layout">
      {props.children}
    </section>
  );
}
