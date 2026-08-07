import type { HTMLAttributes, ReactNode } from "react";
import styles from "./foundation.module.css";

type PageHeaderProps = Omit<HTMLAttributes<HTMLElement>, "title"> & {
  title: ReactNode;
  eyebrow?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
};

export function PageHeader({
  title,
  eyebrow,
  description,
  actions,
  className = "",
  ...props
}: PageHeaderProps) {
  const classes = [styles.pageHeader, className].filter(Boolean).join(" ");

  return (
    <header className={classes} {...props}>
      <div className={styles.pageHeaderCopy}>
        {eyebrow ? <div className={styles.eyebrow}>{eyebrow}</div> : null}
        <h1 className={styles.pageTitle}>{title}</h1>
        {description ? (
          <div className={styles.pageDescription}>{description}</div>
        ) : null}
      </div>
      {actions ? <div className={styles.pageActions}>{actions}</div> : null}
    </header>
  );
}
