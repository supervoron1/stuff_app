"use client";

import { useEffect, useRef, useState } from "react";

// При какой высоте прокрутки показывать кнопку.
const VISIBLE_OFFSET = 300;

/**
 * Плавающая кнопка «наверх» внизу справа.
 * Показывается после прокрутки вниз, плавно поднимает страницу к началу.
 */
export function ScrollToTop() {
  const [visible, setVisible] = useState(false);
  const visibleRef = useRef(false);

  useEffect(() => {
    const onScroll = () => {
      const shouldShow = window.scrollY > VISIBLE_OFFSET;
      // setState только при изменении видимости, чтобы не рендерить на каждый scroll.
      if (shouldShow !== visibleRef.current) {
        visibleRef.current = shouldShow;
        setVisible(shouldShow);
      }
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Прокрутить наверх"
      className="fixed bottom-6 right-4 z-40 flex h-11 w-11 items-center justify-center rounded-full bg-white text-xl text-gray-600 shadow-lg ring-1 ring-gray-200 transition-transform active:scale-95"
    >
      ↑
    </button>
  );
}