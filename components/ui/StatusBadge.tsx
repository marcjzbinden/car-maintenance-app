import type { HTMLAttributes } from "react";
import styles from "./foundation.module.css";

type StatusTone =
  | "neutral"
  | "success"
  | "warning"
  | "danger"
  | "info";

export type StatusBadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: StatusTone;
};

export function StatusBadge({
  tone = "neutral",
  className = "",
  ...props
}: StatusBadgeProps) {
  const classes = [
    styles.statusBadge,
    styles[`status${capitalize(tone)}`],
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return <span className={classes} {...props} />;
}

function capitalize(value: string) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}
