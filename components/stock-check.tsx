"use client";

import { STATUS_LABELS } from "@/lib/constants";
import type { StockStatus } from "@/lib/types";

// Цвета статусов через CSS-переменные — автоматически адаптируются к теме (см. globals.css).
const STATUS_VAR: Record<StockStatus, string> = {
  SUFFICIENT: "var(--status-sufficient)",
  LOW: "var(--status-low)",
  OUT: "var(--status-out)",
  CRITICAL: "var(--status-critical)",
};

interface Props {
  status: StockStatus;
  interactive?: boolean;
  onCycle?: () => void;
}

/**
 * Индикатор наличия: цветная галочка ✓, для CRITICAL — красный «!».
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

  const criticalIcon = (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="h-6 w-6"
      style={{ color }}
    >
      <path d="M12 2a1.5 1.5 0 0 0-1.48 1.72l1.16 10.43a.5.5 0 0 0 .99 0l1.16-10.43A1.5 1.5 0 0 0 12 2z" />
      <circle cx="12" cy="20" r="1.8" />
    </svg>
  );

  const icon = status === "CRITICAL" ? criticalIcon : checkIcon;

  if (!interactive) {
    return (
      <span role="img" aria-label={`Наличие: ${label}`} className="flex h-6 w-6 shrink-0 items-center justify-center">
        {icon}
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
      {icon}
    </button>
  );
}
