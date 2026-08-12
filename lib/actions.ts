"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "./prisma";
import { STATUS_CYCLE, STATUS_LABELS } from "./constants";
import type { StockStatus } from "./types";

const categorySchema = z.object({
  name: z.string().min(1, "Название обязательно").max(100),
});

const productSchema = z.object({
  name: z.string().min(1, "Название обязательно").max(200),
  description: z.string().max(2000).optional().nullable(),
  photoUrl: z.string().url().optional().nullable(),
});

// Единый источник статусов — STATUS_CYCLE из lib/constants.ts (не дублировать список здесь).
const stockStatusSchema = z.enum(STATUS_CYCLE as [StockStatus, ...StockStatus[]]);

function getUserName(formData: FormData): string {
  return formData.get("userName")?.toString().trim() || "Аноним";
}

async function log(
  action: string,
  entity: string,
  userName: string,
  entityId?: string | null,
  oldValue?: string | null,
  newValue?: string | null
) {
  await prisma.auditLog.create({
    data: { action, entity, entityId, oldValue, newValue, userName },
  });
}

// ---------- Категории ----------

export async function createCategory(formData: FormData) {
  const userName = getUserName(formData);
  const parsed = categorySchema.safeParse({
    name: formData.get("name"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message };
  }

  const maxOrder = await prisma.category.aggregate({ _max: { sortOrder: true } });
  const category = await prisma.category.create({
    data: { name: parsed.data.name.trim(), sortOrder: (maxOrder._max.sortOrder ?? 0) + 1 },
  });

  await log("CREATE", "CATEGORY", userName, category.id, null, category.name);
  revalidatePath("/", "layout");
  return { success: true };
}

export async function updateCategory(formData: FormData) {
  const userName = getUserName(formData);
  const id = formData.get("id")?.toString();
  if (!id) return { error: "Не указан ID категории" };

  const parsed = categorySchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message };
  }

  const existing = await prisma.category.findUnique({ where: { id } });
  if (!existing) return { error: "Категория не найдена" };

  const category = await prisma.category.update({
    where: { id },
    data: { name: parsed.data.name.trim() },
  });

  await log("UPDATE", "CATEGORY", userName, id, existing.name, category.name);
  revalidatePath("/", "layout");
  return { success: true };
}

export async function deleteCategory(formData: FormData) {
  const userName = getUserName(formData);
  const id = formData.get("id")?.toString();
  if (!id) return { error: "Не указан ID категории" };

  const existing = await prisma.category.findUnique({ where: { id } });
  if (!existing) return { error: "Категория не найдена" };

  await prisma.category.delete({ where: { id } });

  await log("DELETE", "CATEGORY", userName, id, existing.name, null);
  revalidatePath("/", "layout");
  return { success: true };
}

// ---------- Товары ----------

export async function createProduct(formData: FormData) {
  const userName = getUserName(formData);
  const categoryId = formData.get("categoryId")?.toString();
  if (!categoryId) return { error: "Не указана категория" };

  const parsed = productSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || null,
    photoUrl: formData.get("photoUrl") || null,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message };
  }

  const product = await prisma.product.create({
    data: {
      categoryId,
      name: parsed.data.name.trim(),
      description: parsed.data.description ?? null,
      photoUrl: parsed.data.photoUrl ?? null,
      updatedBy: userName,
    },
  });

  await log("CREATE", "PRODUCT", userName, product.id, null, product.name);
  revalidatePath("/", "layout");
  return { success: true };
}

export async function updateProduct(formData: FormData) {
  const userName = getUserName(formData);
  const id = formData.get("id")?.toString();
  if (!id) return { error: "Не указан ID товара" };

  const parsed = productSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || null,
    photoUrl: formData.get("photoUrl") || null,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message };
  }

  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) return { error: "Товар не найден" };

  const product = await prisma.product.update({
    where: { id },
    data: {
      name: parsed.data.name.trim(),
      description: parsed.data.description ?? null,
      photoUrl: parsed.data.photoUrl ?? null,
      updatedBy: userName,
    },
  });

  await log("UPDATE", "PRODUCT", userName, id, existing.name, product.name);
  revalidatePath("/", "layout");
  return { success: true };
}

export async function deleteProduct(formData: FormData) {
  const userName = getUserName(formData);
  const id = formData.get("id")?.toString();
  if (!id) return { error: "Не указан ID товара" };

  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) return { error: "Товар не найден" };

  await prisma.product.delete({ where: { id } });

  await log("DELETE", "PRODUCT", userName, id, existing.name, null);
  revalidatePath("/", "layout");
  return { success: true };
}

// ---------- Наличие ----------

export async function setStockStatus(formData: FormData) {
  const userName = getUserName(formData);
  const id = formData.get("id")?.toString();
  if (!id) return { error: "Не указан ID товара" };

  const parsedStatus = stockStatusSchema.safeParse(formData.get("stockStatus"));
  if (!parsedStatus.success) return { error: "Неверный статус наличия" };
  const newStatus = parsedStatus.data as StockStatus;

  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) return { error: "Товар не найден" };

  // Для офлайн-синхронизации: клиент может передать updatedAt (время изменения на устройстве).
  // Сервер применяет last-write-wins: если переданное время новее, чем у записи, — обновляем.
  const clientUpdatedAt = formData.get("updatedAt")?.toString();
  if (clientUpdatedAt) {
    const clientTime = new Date(clientUpdatedAt).getTime();
    if (!Number.isNaN(clientTime) && clientTime < existing.updatedAt.getTime()) {
      return { success: true }; // более старый клиент — пропускаем (last-write-wins)
    }
  }

  await prisma.product.update({
    where: { id },
    data: {
      stockStatus: newStatus,
      updatedBy: userName,
      updatedAt: clientUpdatedAt ? new Date(clientUpdatedAt) : new Date(),
    },
  });

  await log(
    "SET_STATUS",
    "PRODUCT",
    userName,
    id,
    STATUS_LABELS[existing.stockStatus],
    STATUS_LABELS[newStatus]
  );
  revalidatePath("/", "layout");
  return { success: true };
}

/**
 * Пакетная загрузка (push) офлайн-операций из очереди устройства.
 * Клиент передаёт применённые изменения, сервер применяет их с last-write-wins.
 */
export async function syncPush(operations: SyncOperationInput[]) {
  if (!Array.isArray(operations) || operations.length === 0) return { success: true };

  let errors = 0;

  for (const op of operations) {
    try {
      await applyOperation(op);
    } catch {
      errors++;
    }
  }

  revalidatePath("/", "layout");
  return { success: errors === 0, errors };
}

async function applyOperation(op: SyncOperationInput) {
  switch (op.type) {
    case "createCategory":
      await prisma.category.upsert({
        where: { id: op.id },
        update: { name: op.payload.name as string },
        create: {
          id: op.id,
          name: op.payload.name as string,
          sortOrder: (op.payload.sortOrder as number) ?? 0,
        },
      });
      break;
    case "updateCategory": {
      const existing = await prisma.category.findUnique({ where: { id: op.id } });
      if (!existing) break;
      await prisma.category.update({
        where: { id: op.id },
        data: { name: op.payload.name as string },
      });
      break;
    }
    case "deleteCategory":
      await prisma.category.delete({ where: { id: op.id } }).catch(() => {});
      break;
    case "createProduct":
      await prisma.product.upsert({
        where: { id: op.id },
        update: {
          name: op.payload.name as string,
          description: (op.payload.description as string) ?? null,
          photoUrl: (op.payload.photoUrl as string) ?? null,
          updatedBy: op.payload.updatedBy as string,
        },
        create: {
          id: op.id,
          categoryId: op.payload.categoryId as string,
          name: op.payload.name as string,
          description: (op.payload.description as string) ?? null,
          photoUrl: (op.payload.photoUrl as string) ?? null,
          updatedBy: op.payload.updatedBy as string,
        },
      });
      break;
    case "updateProduct": {
      const existing = await prisma.product.findUnique({ where: { id: op.id } });
      if (!existing) break;
      await prisma.product.update({
        where: { id: op.id },
        data: {
          name: op.payload.name as string,
          description: (op.payload.description as string) ?? null,
          photoUrl: (op.payload.photoUrl as string) ?? null,
          updatedBy: op.payload.updatedBy as string,
        },
      });
      break;
    }
    case "deleteProduct":
      await prisma.product.delete({ where: { id: op.id } }).catch(() => {});
      break;
    case "setStockStatus": {
      const existing = await prisma.product.findUnique({ where: { id: op.id } });
      if (!existing) break;

      const clientTime = new Date(op.createdAt).getTime();
      if (!Number.isNaN(clientTime) && clientTime < existing.updatedAt.getTime()) {
        break; // last-write-wins — пропускаем устаревшую операцию
      }

      await prisma.product.update({
        where: { id: op.id },
        data: { stockStatus: op.payload.stockStatus as StockStatus },
      });
      break;
    }
  }
}

type SyncOperationInput = {
  type: string;
  id: string;
  payload: Record<string, unknown>;
  createdAt: string;
};