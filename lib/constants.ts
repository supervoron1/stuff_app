import type { StockStatus } from "./types";

/**
 * Порядок циклического переключения статуса при тапе по индикатору.
 */
export const STATUS_CYCLE: StockStatus[] = ["SUFFICIENT", "LOW", "OUT"];

export const STATUS_LABELS: Record<StockStatus, string> = {
  SUFFICIENT: "Есть",
  LOW: "Мало",
  OUT: "Нет",
};

export const STATUS_COLORS: Record<StockStatus, string> = {
  SUFFICIENT: "#22c55e",
  LOW: "#eab308",
  OUT: "#ef4444",
};

export const STATUS_STYLES: Record<
  StockStatus,
  { bg: string; text: string; border: string; dot: string }
> = {
  SUFFICIENT: {
    bg: "bg-green-500",
    text: "text-green-700",
    border: "border-green-500",
    dot: "bg-green-500",
  },
  LOW: {
    bg: "bg-yellow-500",
    text: "text-yellow-700",
    border: "border-yellow-500",
    dot: "bg-yellow-500",
  },
  OUT: {
    bg: "bg-red-500",
    text: "text-red-700",
    border: "border-red-500",
    dot: "bg-red-500",
  },
};

export const SYNC_INTERVAL_MS = 10_000;