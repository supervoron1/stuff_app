"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { db } from "@/lib/db";
import { SYNC_INTERVAL_MS } from "@/lib/constants";
import { syncNow } from "@/lib/sync";
import type { Category, Product } from "@/lib/types";

interface InventoryState {
  categories: Category[];
  products: Product[];
  loading: boolean;
  online: boolean;
  pendingOps: number;
  lastSynced: Date | null;
}

/**
 * Хук офлайн-первого доступа к данным:
 * - при загрузке — читает из IndexedDB, затем тянет свежие данные
 * - периодически синхронизируется (push + pull) каждые SYNC_INTERVAL_MS
 * - слушает события online/offline
 */
export function useInventory() {
  const [state, setState] = useState<InventoryState>({
    categories: [],
    products: [],
    loading: true,
    online: typeof navigator === "undefined" ? true : navigator.onLine,
    pendingOps: 0,
    lastSynced: null,
  });

  const syncingRef = useRef(false);
  const pendingSyncRef = useRef(false);

  const refreshLocalCount = useCallback(async () => {
    const count = await db.outbox.count();
    setState((s) => ({ ...s, pendingOps: count }));
  }, []);

  const loadFromLocal = useCallback(async () => {
    const [categories, products] = await Promise.all([
      db.categories.orderBy("sortOrder").toArray(),
      db.products.toArray(),
    ]);
    // Ручной порядок (sortOrder), затем — имя (tie-breaker для равных значений).
    const sortedProducts = products.toSorted(
      (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)
    );
    setState((s) => ({
      ...s,
      categories,
      products: sortedProducts,
      loading: false,
    }));
    await refreshLocalCount();
  }, [refreshLocalCount]);

  const optimisticReorder = useCallback((categoryId: string, orderedIds: string[]) => {
    const rank = new Map<string, number>();
    orderedIds.forEach((id, index) => rank.set(id, index));
    setState((s) => {
      const products = s.products
        .map((p) =>
          p.categoryId === categoryId && rank.has(p.id)
            ? { ...p, sortOrder: rank.get(p.id)! }
            : p
        )
        .toSorted((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
      return { ...s, products };
    });
  }, []);

  const doSync = useCallback(async () => {
    // Если синхронизация уже идёт — запоминаем запрос и выполним ещё один проход после.
    if (syncingRef.current) {
      pendingSyncRef.current = true;
      return;
    }
    syncingRef.current = true;
    try {
      // Повторяем, если во время синхронизации в outbox добавились новые операции
      // (например, reorder в момент push) — иначе replaceCache откатит свежие изменения.
      let remaining = 3;
      do {
        await syncNow();
        const pending = await db.outbox.count();
        if (pending === 0) break;
        remaining--;
      } while (remaining > 0);
      await loadFromLocal();
      setState((s) => ({ ...s, lastSynced: new Date(), online: true }));
    } catch {
      setState((s) => ({ ...s, online: false }));
    } finally {
      syncingRef.current = false;
      if (pendingSyncRef.current) {
        pendingSyncRef.current = false;
        doSync();
      }
    }
  }, [loadFromLocal]);

  const handleOnline = useCallback(() => {
    setState((s) => ({ ...s, online: true }));
    doSync();
  }, [doSync]);

  const handleOffline = useCallback(() => {
    setState((s) => ({ ...s, online: false }));
  }, []);

  useEffect(() => {
    loadFromLocal();
    doSync();

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    const interval = setInterval(doSync, SYNC_INTERVAL_MS);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearInterval(interval);
    };
  }, [loadFromLocal, doSync, handleOnline, handleOffline]);

  return {
    ...state,
    refresh: doSync,
    refreshLocal: loadFromLocal,
    optimisticReorder,
  };
}

/**
 * Вспомогательные клиентские операции: записывают в локальную БД
 * и ставят операцию в outbox для последующей отправки.
 */
export async function createCategoryLocal(id: string, name: string, sortOrder: number, updatedBy: string | null = null) {
  const now = new Date().toISOString();
  const category: Category = { id, name, sortOrder, createdAt: now, updatedAt: now };
  await db.categories.add(category);
  await db.outbox.add({
    type: "createCategory" as const,
    id,
    payload: { name, updatedBy },
    createdAt: now,
  });
  return category;
}

export async function updateCategoryLocal(id: string, name: string, updatedBy: string | null = null) {
  const now = new Date().toISOString();
  await db.categories.update(id, { name, updatedAt: now });
  await db.outbox.add({
    type: "updateCategory" as const,
    id,
    payload: { name, updatedBy },
    createdAt: now,
  });
}

export async function deleteCategoryLocal(id: string, updatedBy: string | null = null) {
  const now = new Date().toISOString();
  await db.products.where("categoryId").equals(id).delete();
  await db.categories.delete(id);
  await db.outbox.add({
    type: "deleteCategory" as const,
    id,
    payload: { updatedBy },
    createdAt: now,
  });
}

export async function createProductLocal(
  id: string,
  categoryId: string,
  name: string,
  description: string | null,
  photoUrl: string | null,
  updatedBy: string | null = null
) {
  const now = new Date().toISOString();
  // Новый товар встаёт в конец категории (после максимального sortOrder).
  const productsInCategory = await db.products.where("categoryId").equals(categoryId).toArray();
  let maxSort = -1;
  for (const p of productsInCategory) {
    if (p.sortOrder > maxSort) maxSort = p.sortOrder;
  }
  const sortOrder = maxSort + 1;
  const product: Product = {
    id,
    categoryId,
    name,
    description,
    photoUrl,
    stockStatus: "SUFFICIENT",
    sortOrder,
    updatedAt: now,
    updatedBy,
    createdAt: now,
  };
  await db.products.add(product);
  await db.outbox.add({
    type: "createProduct" as const,
    id,
    payload: { categoryId, name, description, photoUrl, sortOrder, updatedBy },
    createdAt: now,
  });
  return product;
}

export async function updateProductLocal(
  id: string,
  name: string,
  description: string | null,
  photoUrl: string | null,
  updatedBy: string | null = null
) {
  const now = new Date().toISOString();
  await db.products.update(id, { name, description, photoUrl, updatedAt: now, updatedBy });
  await db.outbox.add({
    type: "updateProduct" as const,
    id,
    payload: { name, description, photoUrl, updatedBy },
    createdAt: now,
  });
}

export async function deleteProductLocal(id: string, updatedBy: string | null = null) {
  const now = new Date().toISOString();
  await db.products.delete(id);
  await db.outbox.add({
    type: "deleteProduct" as const,
    id,
    payload: { updatedBy },
    createdAt: now,
  });
}

export async function setStockStatusLocal(
  id: string,
  stockStatus: Product["stockStatus"],
  updatedBy: string | null,
  updatedAt?: string
) {
  const now = updatedAt ?? new Date().toISOString();
  await db.products.update(id, { stockStatus, updatedAt: now, updatedBy });
  await db.outbox.add({
    type: "setStockStatus" as const,
    id,
    payload: { stockStatus, updatedBy },
    createdAt: now,
  });
}

/**
 * Перестановка товаров внутри категории: проставляет sortOrder 0..N всем
 * товарам категории (полный список id в новом порядке) и ставит операцию
 * в очередь для серверной синхронизации.
 */
export async function reorderProductsLocal(
  categoryId: string,
  orderedIds: string[],
  updatedBy: string | null = null
) {
  const now = new Date().toISOString();
  await db.transaction("rw", db.products, async () => {
    for (const [index, productId] of orderedIds.entries()) {
      await db.products.update(productId, { sortOrder: index, updatedAt: now });
    }
  });
  await db.outbox.add({
    type: "reorderProducts" as const,
    id: createId(),
    payload: { categoryId, orderedIds, updatedBy },
    createdAt: now,
  });
}

export function createId(): string {
  // crypto.randomUUID() доступен в современных браузерах (включая мобильные, в secure context).
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // Фолбэк
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}