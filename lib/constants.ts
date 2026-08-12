import type { StockStatus } from "./types";

/**
 * Порядок циклического переключения статуса при тапе по индикатору.
 */
export const STATUS_CYCLE: StockStatus[] = ["SUFFICIENT", "LOW", "OUT", "CRITICAL"];

export const STATUS_LABELS: Record<StockStatus, string> = {
  SUFFICIENT: "Есть",
  LOW: "Мало",
  OUT: "Нет",
  CRITICAL: "Критично",
};

export const STATUS_COLORS: Record<StockStatus, string> = {
  SUFFICIENT: "#22c55e",
  LOW: "#eab308",
  OUT: "#ef4444",
  CRITICAL: "#dc2626",
};

export const STATUS_STYLES: Record<
  StockStatus,
  { bg: string; text: string; border: string; dot: string }
> = {
  SUFFICIENT: {
    bg: "bg-green-500 dark:bg-green-400",
    text: "text-green-700 dark:text-green-400",
    border: "border-green-500 dark:border-green-400",
    dot: "bg-green-500 dark:bg-green-400",
  },
  LOW: {
    bg: "bg-yellow-500 dark:bg-yellow-400",
    text: "text-yellow-700 dark:text-yellow-400",
    border: "border-yellow-500 dark:border-yellow-400",
    dot: "bg-yellow-500 dark:bg-yellow-400",
  },
  OUT: {
    bg: "bg-red-500 dark:bg-red-400",
    text: "text-red-700 dark:text-red-400",
    border: "border-red-500 dark:border-red-400",
    dot: "bg-red-500 dark:bg-red-400",
  },
  CRITICAL: {
    bg: "bg-red-700 dark:bg-red-500",
    text: "text-red-800 dark:text-red-300",
    border: "border-red-700 dark:border-red-500",
    dot: "bg-red-700 dark:bg-red-500",
  },
};

export const SYNC_INTERVAL_MS = 10_000;