"use client";

import { STATUS_LABELS, STATUS_STYLES } from "@/lib/constants";
import type { StockStatus } from "@/lib/types";

interface Props {
  status: StockStatus;
  interactive?: boolean;
  onCycle?: () => void;
}

export function StockIndicator({ status, interactive = false, onCycle }: Props) {
  const style = STATUS_STYLES[status];
  const label = STATUS_LABELS[status];

  if (!interactive) {
    return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-white dark:text-gray-900 ${style.bg}`}>{label}</span>;
  }

  return (
    <button
      type="button"
      onClick={onCycle}
      className={`flex h-9 min-w-[104px] items-center justify-center gap-2 rounded-full px-3 text-sm font-semibold text-white dark:text-gray-900 shadow-sm transition-transform active:scale-95 ${style.bg}`}
      aria-label={`Наличие: ${label}. Нажмите, чтобы изменить`}
    >
      <span className="h-2.5 w-2.5 rounded-full bg-white/80 dark:bg-gray-900/70" />
      {label}
    </button>
  );
}