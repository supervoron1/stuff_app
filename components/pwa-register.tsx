"use client";

import { useEffect, useRef, useState } from "react";

// Как часто проверять наличие новой версии Service Worker (sw.js).
const CHECK_INTERVAL_MS = 60_000;

/**
 * Регистрация Service Worker для PWA + механизм обновления «как в Play Market»:
 * - периодически вызывает registration.update(), чтобы находить новую версию
 *   прямо во время работы приложения (баннер появится в течение интервала проверки);
 * - при появлении новой версии показывает баннер «Доступна новая версия»;
 * - по кнопке «Обновить» отправляет SKIP_WAITING и перезагружает страницу,
 *   чтобы подтянуть новые JS/CSS.
 */
export function PwaRegister() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let timer: ReturnType<typeof setInterval> | null = null;

    const checkForUpdates = () => {
      registrationRef.current?.update().catch(() => {});
    };

    navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .then((registration) => {
        registrationRef.current = registration;

        // Новая версия уже найдена (например, ждёт с прошлой сессии) — сразу показываем баннер.
        if (registration.waiting) {
          setUpdateAvailable(true);
        }

        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          if (!newWorker) return;
          newWorker.addEventListener("statechange", () => {
            // installed + есть активный старый SW — новая версия готова, показываем баннер.
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              setUpdateAvailable(true);
            }
          });
        });
      })
      .catch(() => {
        // Не критично — приложение работает и без SW.
      });

    // Периодическая проверка + при возвращении в приложение.
    timer = setInterval(checkForUpdates, CHECK_INTERVAL_MS);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") checkForUpdates();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", checkForUpdates);

    // Новый SW активирован (после SKIP_WAITING) — перезагружаем страницу,
    // чтобы загрузить новые бандлы.
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      window.location.reload();
    });

    return () => {
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", checkForUpdates);
    };
  }, []);

  const applyUpdate = () => {
    const registration = registrationRef.current;
    const waiting = registration?.waiting;
    if (waiting) {
      waiting.postMessage({ type: "SKIP_WAITING" });
      // controllerchange выполнит reload после активации.
    } else {
      window.location.reload();
    }
  };

  const dismiss = () => {
    setUpdateAvailable(false);
  };

  if (!updateAvailable) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 px-3 pb-3">
      <div className="mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-lg">
        <p className="text-sm text-gray-700">Доступна новая версия</p>
        <div className="flex shrink-0 items-center gap-2">
          <button onClick={dismiss} className="rounded-lg px-2 py-1 text-sm text-gray-500 hover:bg-gray-100">
            Позже
          </button>
          <button
            onClick={applyUpdate}
            className="rounded-xl bg-green-600 px-3 py-1.5 text-sm font-medium text-white active:scale-95"
          >
            Обновить
          </button>
        </div>
      </div>
    </div>
  );
}