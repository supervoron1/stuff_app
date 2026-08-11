export type StockStatus = "SUFFICIENT" | "LOW" | "OUT";

export interface Category {
  id: string;
  name: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  photoUrl: string | null;
  stockStatus: StockStatus;
  sortOrder: number;
  updatedAt: string;
  updatedBy: string | null;
  createdAt: string;
}

export interface CategoryWithProducts extends Category {
  products: Product[];
}

export interface AuditLog {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  oldValue: string | null;
  newValue: string | null;
  userName: string;
  createdAt: string;
}

/**
 * Типы операций исходящей очереди (outbox) для офлайн-синхронизации.
 */
export type SyncOperation =
  | {
      type: "createCategory" | "updateCategory" | "deleteCategory";
      id: string;
      payload: Record<string, unknown>;
      createdAt: string;
    }
  | {
      type: "createProduct" | "updateProduct" | "deleteProduct";
      id: string;
      payload: Record<string, unknown>;
      createdAt: string;
    }
  | {
      type: "setStockStatus";
      id: string;
      payload: Record<string, unknown>;
      createdAt: string;
    }
  | {
      type: "reorderProducts";
      id: string;
      payload: {
        categoryId: string;
        orderedIds: string[];
        updatedBy: string | null;
      };
      createdAt: string;
    };