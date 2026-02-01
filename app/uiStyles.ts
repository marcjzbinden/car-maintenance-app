import type { CSSProperties } from "react";

export const colors = {
  bg: "#1e1e1e",
  panel: "#252526",
  border: "#3c3c3c",
  text: "#e6e6e6",
  muted: "#a0a0a0",
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
  background: colors.bg,
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
