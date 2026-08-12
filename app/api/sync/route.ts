import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { STATUS_LABELS } from "@/lib/constants";
import type { StockStatus } from "@/lib/types";



/**
 * GET /api/sync — полный снимок данных для офлайн-синхронизации (pull).
 */
export async function GET() {
  const [categories, products] = await Promise.all([
    prisma.category.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.product.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
  ]);

  return NextResponse.json({
    ok: true,
    serverTime: new Date().toISOString(),
    categories,
    products,
  });
}

type SyncOp = {
  type: string;
  id: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

/**
 * POST /api/sync — приём офлайн-операций из очереди устройства (push).
 * Применяет last-write-wins по updatedAt / createdAt.
 */
export async function POST(request: Request) {
  let operations: SyncOp[] = [];
  try {
    const body = await request.json();
    operations = Array.isArray(body.operations) ? body.operations : [];
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  let applied = 0;
  let errors = 0;

  if (operations.length > 0) {
    for (const op of operations) {
      try {
        await applyOp(op);
        applied++;
      } catch {
        errors++;
      }
    }
  }

  // Возвращаем актуальный снимок в том же ответе, чтобы клиенту
  // не пришлось делать отдельный GET (экономия RTT и хол. старта).
  const [categories, products] = await Promise.all([
    prisma.category.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.product.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
  ]);

  return NextResponse.json({
    ok: errors === 0,
    applied,
    errors,
    snapshot: { categories, products, serverTime: new Date().toISOString() },
  });
}

async function logAudit(
  action: string,
  entity: string,
  userName: string,
  entityId: string,
  oldValue: string | null,
  newValue: string | null
) {
  await prisma.auditLog
    .create({
      data: { action, entity, entityId, oldValue, newValue, userName },
    })
    .catch(() => {});
}

async function applyOp(op: SyncOp) {
  const userName = op.payload.updatedBy ? String(op.payload.updatedBy) : "Аноним";

  switch (op.type) {
    case "createCategory": {
      const name = String(op.payload.name ?? "");
      await prisma.category.upsert({
        where: { id: op.id },
        update: { name },
        create: { id: op.id, name, sortOrder: Number(op.payload.sortOrder ?? 0) },
      });
      await logAudit("CREATE", "CATEGORY", userName, op.id, null, name);
      break;
    }

    case "updateCategory": {
      const existing = await prisma.category.findUnique({ where: { id: op.id } });
      const name = String(op.payload.name ?? "");
      await prisma.category.upsert({
        where: { id: op.id },
        update: { name },
        create: { id: op.id, name, sortOrder: Number(op.payload.sortOrder ?? 0) },
      });
      await logAudit("UPDATE", "CATEGORY", userName, op.id, existing?.name ?? null, name);
      break;
    }

    case "deleteCategory": {
      const existing = await prisma.category.findUnique({ where: { id: op.id } });
      await prisma.category.delete({ where: { id: op.id } }).catch(() => {});
      if (existing) {
        await logAudit("DELETE", "CATEGORY", userName, op.id, existing.name, null);
      }
      break;
    }

    case "createProduct":
    case "updateProduct": {
      const name = String(op.payload.name ?? "");
      const description = op.payload.description ? String(op.payload.description) : null;
      const photoUrl = op.payload.photoUrl ? String(op.payload.photoUrl) : null;
      // Новый товар встаёт в конец категории: sortOrder сохраняем из payload.
      const sortOrder =
        typeof op.payload.sortOrder === "number" ? op.payload.sortOrder : 0;

      const existing = await prisma.product.findUnique({ where: { id: op.id } });
      await prisma.product.upsert({
        where: { id: op.id },
        update: { name, description, photoUrl, updatedBy: userName },
        create: {
          id: op.id,
          categoryId: String(op.payload.categoryId ?? ""),
          name,
          description,
          photoUrl,
          sortOrder,
          updatedBy: userName,
        },
      });
      await logAudit(
        existing ? "UPDATE" : "CREATE",
        "PRODUCT",
        userName,
        op.id,
        existing?.name ?? null,
        name
      );
      break;
    }

    case "deleteProduct": {
      const existing = await prisma.product.findUnique({ where: { id: op.id } });
      await prisma.product.delete({ where: { id: op.id } }).catch(() => {});
      if (existing) {
        await logAudit("DELETE", "PRODUCT", userName, op.id, existing.name, null);
      }
      break;
    }

    case "setStockStatus": {
      const existing = await prisma.product.findUnique({ where: { id: op.id } });
      if (!existing) break;

      // Last-write-wins: операция новее, чем текущая запись — применяем.
      const opTime = new Date(op.createdAt).getTime();
      if (Number.isNaN(opTime) || opTime < existing.updatedAt.getTime()) {
        break;
      }

      const status = String(op.payload.stockStatus ?? "") as StockStatus;
      if (!["SUFFICIENT", "LOW", "OUT"].includes(status)) break;

      await prisma.product.update({
        where: { id: op.id },
        data: { stockStatus: status, updatedAt: new Date(opTime) },
      });
      await logAudit(
        "SET_STATUS",
        "PRODUCT",
        userName,
        op.id,
        STATUS_LABELS[existing.stockStatus] ?? existing.stockStatus,
        STATUS_LABELS[status] ?? status
      );
      break;
    }

    // Перестановка товаров внутри категории: полный список id в новом порядке
    // целиком заменяет sortOrder всех товаров категории (последняя операция побеждает).
    // В аудит не пишем — по соглашению с пользователем.
    case "reorderProducts": {
      const categoryId = String(op.payload.categoryId ?? "");
      const rawOrderedIds = Array.isArray(op.payload.orderedIds)
        ? op.payload.orderedIds.map(String)
        : [];
      if (!categoryId || rawOrderedIds.length === 0) break;

      const products = await prisma.product.findMany({
        where: { categoryId },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: { id: true },
      });
      const idsInCategory = new Set(products.map((p) => p.id));
      const orderedIds = rawOrderedIds.filter((id) => idsInCategory.has(id));
      // Товары, не попавшие в список (например, созданные на другом устройстве),
      // дописываем в конец в их текущем относительном порядке.
      const remainder = products.map((p) => p.id).filter((id) => !orderedIds.includes(id));
      const fullOrder = [...orderedIds, ...remainder];
      if (fullOrder.length === 0) break;

      await prisma.$transaction(
        fullOrder.map((id, index) =>
          prisma.product.update({
            where: { id },
            data: { sortOrder: index },
          })
        )
      );
      break;
    }

    // Перестановка категорий: полный список id в новом порядке целиком заменяет
    // sortOrder всех категорий (последняя операция побеждает).
    // В аудит не пишем — по соглашению с пользователем (как товары).
    case "reorderCategories": {
      const rawOrderedIds = Array.isArray(op.payload.orderedIds)
        ? op.payload.orderedIds.map(String)
        : [];
      if (rawOrderedIds.length === 0) break;

      const categories = await prisma.category.findMany({
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: { id: true },
      });
      const allIds = new Set(categories.map((c) => c.id));
      const orderedIds = rawOrderedIds.filter((id) => allIds.has(id));
      // Категории, не попавшие в список (например, созданные на другом устройстве),
      // дописываем в конец в их текущем относительном порядке.
      const remainder = categories.map((c) => c.id).filter((id) => !orderedIds.includes(id));
      const fullOrder = [...orderedIds, ...remainder];
      if (fullOrder.length === 0) break;

      await prisma.$transaction(
        fullOrder.map((id, index) =>
          prisma.category.update({
            where: { id },
            data: { sortOrder: index },
          })
        )
      );
      break;
    }
  }
}