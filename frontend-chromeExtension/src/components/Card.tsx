import { ReactNode } from "react";

import { theme } from "../theme";

interface CardProps {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function Card({ title, children, footer }: CardProps) {
  return (
    <div
      style={{
        background: theme.colors.panel,
        border: `1px solid ${theme.colors.border}`,
        borderRadius: theme.radii.md,
        padding: "14px",
        boxShadow: theme.shadow,
      }}
    >
      <div style={{ color: theme.colors.text, fontWeight: 700, marginBottom: 8 }}>{title}</div>
      <div style={{ color: theme.colors.subtext, fontSize: 14 }}>{children}</div>
      {footer ? <div style={{ marginTop: 10 }}>{footer}</div> : null}
    </div>
  );
}
