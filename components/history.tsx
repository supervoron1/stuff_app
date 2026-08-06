"use client";

import { useEffect, useState } from "react";

import { Modal } from "./modal";
import type { AuditLog } from "@/lib/types";

const ACTION_LABELS: Record<string, string> = {
  CREATE: "Создание",
  UPDATE: "Изменение",
  DELETE: "Удаление",
  SET_STATUS: "Наличие",
};

const ENTITY_LABELS: Record<string, string> = {
  CATEGORY: "категория",
  PRODUCT: "товар",
};

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

interface HistoryProps {
  open: boolean;
  onClose: () => void;
}

export function History({ open, onClose }: HistoryProps) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch("/api/audit", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => setLogs(data.logs ?? []))
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  }, [open]);

  return (
    <Modal open={open} title="История изменений" onClose={onClose}>
      {loading ? (
        <p className="py-6 text-center text-gray-500">Загрузка...</p>
      ) : logs.length === 0 ? (
        <p className="py-6 text-center text-gray-500">Пока нет записей</p>
      ) : (
        <ul className="max-h-[60vh] divide-y divide-gray-100 overflow-y-auto">
          {logs.map((log) => (
            <li key={log.id} className="py-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-gray-900">{log.userName}</span>
                <span className="shrink-0 text-xs text-gray-400">{formatTime(log.createdAt)}</span>
              </div>
              <p className="mt-0.5 text-sm text-gray-600">
                {ACTION_LABELS[log.action] ?? log.action}{" "}
                {ENTITY_LABELS[log.entity] ?? log.entity.toLowerCase()}
                {log.newValue ? `: ${log.newValue}` : ""}
                {log.oldValue && log.newValue && log.oldValue !== log.newValue
                  ? ` (было: ${log.oldValue})`
                  : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}