import { prisma } from "./prisma";
import type { CategoryWithProducts } from "./types";

/**
 * Полный снимок данных: категории с товарами, отсортированные по sortOrder.
 */
export async function getCategoriesWithProducts(): Promise<CategoryWithProducts[]> {
  const categories = await prisma.category.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      products: {
        orderBy: { name: "asc" },
      },
    },
  });

  return categories.map((c) => ({
    ...c,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    products: c.products.map((p) => ({
      ...p,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    })),
  }));
}

/**
 * Аудит-лог последних действий.
 */
export async function getAuditLogs(limit = 100) {
  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return logs.map((l) => ({
    ...l,
    createdAt: l.createdAt.toISOString(),
  }));
}