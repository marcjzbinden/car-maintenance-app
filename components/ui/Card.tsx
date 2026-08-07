import type { HTMLAttributes } from "react";
import styles from "./foundation.module.css";

type CardTone = "default" | "subtle" | "elevated";

export type CardProps = HTMLAttributes<HTMLDivElement> & {
  tone?: CardTone;
  padding?: "sm" | "md" | "lg";
};

export function Card({
  tone = "default",
  padding = "md",
  className = "",
  ...props
}: CardProps) {
  const classes = [
    styles.card,
    styles[`card${capitalize(tone)}`],
    styles[`cardPadding${capitalize(padding)}`],
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return <div className={classes} {...props} />;
}

function capitalize(value: string) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}
