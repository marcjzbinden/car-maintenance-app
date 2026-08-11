"use client";

import { useEffect } from "react";
import {
  applyThemePreference,
  getStoredThemePreference,
  THEME_STORAGE_KEY,
} from "@/lib/theme";

export function ThemeSync() {
  useEffect(() => {
    const colorScheme = window.matchMedia("(prefers-color-scheme: dark)");
    const syncTheme = () => applyThemePreference(getStoredThemePreference());

    function handleStorage(event: StorageEvent) {
      if (event.key === THEME_STORAGE_KEY || event.key === null) syncTheme();
    }

    syncTheme();
    colorScheme.addEventListener("change", syncTheme);
    window.addEventListener("storage", handleStorage);

    return () => {
      colorScheme.removeEventListener("change", syncTheme);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  return null;
}
