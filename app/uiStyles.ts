import type { CSSProperties } from "react";

export const colors = {
  bg: "var(--color-canvas)",
  panel: "var(--color-surface-raised)",
  subtle: "var(--color-surface-subtle)",
  border: "var(--color-border-strong)",
  text: "var(--color-text-strong)",
  muted: "var(--color-text-muted)",
  danger: "var(--color-danger-text)",
};

export const pageStyle: CSSProperties = {
  padding: 16,
  fontFamily: "system-ui",
  maxWidth: 820,
  margin: "0 auto",
  background: colors.bg,
  color: colors.text,
  minHeight: "100vh",
};

export const panelStyle: CSSProperties = {
  border: `1px solid ${colors.border}`,
  background: colors.panel,
  borderRadius: 12,
  padding: 14,
};

export const inputStyle: CSSProperties = {
  display: "block",
  width: "100%",
  padding: 10,
  borderRadius: 10,
  border: `1px solid ${colors.border}`,
  background: colors.subtle,
  color: colors.text,
  marginTop: 6,
};

export const buttonStyle: CSSProperties = {
  padding: "8px 10px",
  borderRadius: 10,
  border: `1px solid ${colors.border}`,
  background: colors.panel,
  color: colors.text,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

export const disabledButtonStyle: CSSProperties = {
  ...buttonStyle,
  background: colors.bg,
  color: colors.muted,
  cursor: "not-allowed",
};
