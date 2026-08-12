"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "inventory-user-name";

/**
 * Имя пользователя хранится в localStorage и используется для аудита действий.
 */
export function useUser() {
  const [userName, setUserNameState] = useState<string>("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      // Осознанный паттерн: чтение localStorage после гидратации (нельзя в useState —
      // на сервере localStorage недоступен, иначе hydration mismatch).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setUserNameState(saved);
    } catch {
      // localStorage недоступен — игнорируем
    }
  }, []);

  const setUserName = useCallback((name: string) => {
    const trimmed = name.trim();
    setUserNameState(trimmed);
    try {
      if (trimmed) {
        localStorage.setItem(STORAGE_KEY, trimmed);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // localStorage недоступен — игнорируем
    }
  }, []);

  return { userName, setUserName };
}