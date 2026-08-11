"use client";

import { STATUS_LABELS } from "@/lib/constants";
import type { StockStatus } from "@/lib/types";

// Цвета статусов через CSS-переменные — автоматически адаптируются к теме (см. globals.css).
const STATUS_VAR: Record<StockStatus, string> = {
  SUFFICIENT: "var(--status-sufficient)",
  LOW: "var(--status-low)",
  OUT: "var(--status-out)",
};

interface Props {
  status: StockStatus;
  interactive?: boolean;
  onCycle?: () => void;
}

/**
 * Индикатор наличия: просто цветная галочка ✓.
 * Цвет зависит от статуса (зелёный/жёлтый/красный).
 */
export function StockCheck({ status, interactive = false, onCycle }: Props) {
  const label = STATUS_LABELS[status];
  const color = STATUS_VAR[status];

  const checkIcon = (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={3.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-6 w-6"
      style={{ color }}
    >
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );

  if (!interactive) {
    return (
      <span role="img" aria-label={`Наличие: ${label}`} className="flex h-6 w-6 shrink-0 items-center justify-center">
        {checkIcon}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onCycle}
      aria-label={`Наличие: ${label}. Нажмите, чтобы изменить`}
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-transform hover:bg-gray-100 dark:hover:bg-gray-800 active:scale-95"
    >
      {checkIcon}
    </button>
  );
}
