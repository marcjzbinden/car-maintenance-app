import type { HTMLAttributes, ReactNode } from "react";
import { AppHeader } from "./AppHeader";
import styles from "./foundation.module.css";

type AppShellProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  authenticated?: boolean;
  displayName?: string;
  contentWidth?: "default" | "narrow";
};

export function AppShell({
  children,
  authenticated = false,
  displayName,
  contentWidth = "default",
  className = "",
  ...props
}: AppShellProps) {
  const classes = [styles.shell, className].filter(Boolean).join(" ");
  const contentClasses = [
    styles.shellContent,
    contentWidth === "narrow" ? styles.shellContentNarrow : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} {...props}>
      {authenticated ? <AppHeader displayName={displayName} /> : null}
      <main className={contentClasses}>{children}</main>
    </div>
  );
}
