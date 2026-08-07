import type { HTMLAttributes, ReactNode } from "react";
import styles from "./foundation.module.css";

type AppShellProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
};

export function AppShell({ children, className = "", ...props }: AppShellProps) {
  const classes = [styles.shell, className].filter(Boolean).join(" ");

  return (
    <div className={classes} {...props}>
      <main className={styles.shellContent}>{children}</main>
    </div>
  );
}
