import Dexie, { type Table } from "dexie";

import type { Category, Product, SyncOperation } from "./types";

export interface PendingPhoto {
  id: string;
  localId: string; // id файла
  productId: string;
  dataUrl: string;
  fileName: string;
}

/**
 * Локальная БЗ (IndexedDB) для офлайн-работы:
 * - кэш категорий и товаров
 * - очередь исходящих операций (outbox)
 * - очередь фото, ожидающих загрузки на сервер
 */
class InventoryDB extends Dexie {
  categories!: Table<Category, string>;
  products!: Table<Product, string>;
  outbox!: Table<SyncOperation, string>;
  pendingPhotos!: Table<PendingPhoto, string>;

  constructor() {
    super("inventory-db");
    this.version(1).stores({
      categories: "id, sortOrder",
      products: "id, categoryId, stockStatus, updatedAt",
      outbox: "++id, createdAt",
      pendingPhotos: "++id, productId",
    });
    // v2: индекс sortOrder у товаров — для сортировки по ручному порядку.
    this.version(2).stores({
      products: "id, categoryId, sortOrder, stockStatus, updatedAt",
    });
  }
}

export const db = new InventoryDB();

export function isOnline(): boolean {
  return typeof navigator !== "undefined" ? navigator.onLine : true;
}