import type { ButtonHTMLAttributes } from "react";
import styles from "./foundation.module.css";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
};

export function Button({
  variant = "secondary",
  size = "md",
  fullWidth = false,
  className = "",
  type = "button",
  ...props
}: ButtonProps) {
  const classes = [
    styles.button,
    styles[`button${capitalize(variant)}`],
    styles[`button${capitalize(size)}`],
    fullWidth ? styles.buttonFullWidth : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return <button type={type} className={classes} {...props} />;
}

function capitalize(value: string) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}
