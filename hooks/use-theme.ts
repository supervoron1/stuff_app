"use client";

import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "theme";

const THEME_ICONS: Record<Theme, string> = {
  light: "☀️",
  dark: "🌙",
  system: "🖥️",
};

const THEME_TITLES: Record<Theme, string> = {
  light: "Тёмная тема",
  dark: "Системная тема",
  system: "Светлая тема",
};

function readStoredTheme(): Theme | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === "light" || raw === "dark" || raw === "system" ? raw : null;
  } catch {
    return null;
  }
}

function applyThemeClass(theme: Theme) {
  const root = document.documentElement;
  const isDark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.classList.toggle("dark", isDark);
}

/** Статус-бар на телефоне: обновляем meta theme-color в соответствии с темой. */
function applyThemeColor() {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute(
      "content",
      document.documentElement.classList.contains("dark") ? "#0a0a0a" : "#ffffff"
    );
  }
}

/**
 * Тема приложения (светлая/тёмная/системная).
 * По умолчанию — светлая до первого ручного переключения; выбор хранится локально.
 */
export function useTheme() {
  // На клиенте читаем сохранённую тему синхронно; на сервере/при первом рендере — светлая.
  const [theme, setTheme] = useState<Theme>(() => readStoredTheme() ?? "light");

  useEffect(() => {
    applyThemeClass(theme);
    applyThemeColor();
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // localStorage недоступен — работаем без сохранения.
    }
  }, [theme]);

  // В режиме «системная» следим за сменой системной темы.
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      applyThemeClass("system");
      applyThemeColor();
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === "light" ? "dark" : t === "dark" ? "system" : "light"));
  }, []);

  return { theme, toggleTheme, themeIcon: THEME_ICONS[theme], themeTitle: THEME_TITLES[theme] };
}