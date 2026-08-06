"use client";

import { useEffect } from "react";

/**
 * Регистрация Service Worker для PWA (установка на главный экран, офлайн).
 */
export function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Не критично — приложение работает и без SW
      });
    }
  }, []);

  return null;
}