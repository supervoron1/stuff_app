import { db, isOnline } from "./db";
import type { Category, Product, SyncOperation } from "./types";

/**
 * Сортировка товаров: ручной порядок (sortOrder), затем имя (tie-breaker).
 */
function sortProducts(products: Product[]): Product[] {
  return products.toSorted(
    (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)
  );
}

/**
 * Полный снимок с сервера (pull).
 */
async function fetchSnapshot() {
  const res = await fetch("/api/sync", { cache: "no-store" });
  if (!res.ok) throw new Error("Не удалось получить данные");
  const data = await res.json();
  return {
    categories: data.categories as Category[],
    products: sortProducts(data.products as Product[]),
  };
}

/**
 * Замена локального кэша полным снимком (после успешного push).
 */
async function replaceCache(categories: Category[], products: Product[]) {
  await db.transaction("rw", [db.categories, db.products], async () => {
    await db.categories.clear();
    await db.products.clear();
    await db.categories.bulkPut(categories);
    await db.products.bulkPut(products);
  });
}

/**
 * Пуш очереди исходящих операций на сервер.
 * При успехе — очередь очищается, локальный кэш заменяется свежим снимком.
 */
export async function pushOutbox(): Promise<{ applied: number; errors: number }> {
  if (!isOnline()) return { applied: 0, errors: 0 };

  const operations = await db.outbox.orderBy("createdAt").toArray();
  if (operations.length === 0) return { applied: 0, errors: 0 };

  const res = await fetch("/api/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operations }),
  });

  if (!res.ok) throw new Error("Ошибка синхронизации");

  const data = await res.json();

  // Если сервер не применил часть операций — очередь НЕ очищаем и кэш НЕ перезаписываем
  // снимком: офлайн-изменения не должны теряться молча, они останутся в outbox
  // и будут повторно отправлены при следующей синхронизации.
  if (!data.ok || (data.errors ?? 0) > 0) {
    return { applied: data.applied ?? 0, errors: data.errors ?? operations.length };
  }

  await db.outbox.clear();

  // Сервер возвращает свежий снимок в том же ответе — обновляем кэш без лишнего GET.
  if (data.snapshot) {
    await replaceCache(data.snapshot.categories, sortProducts(data.snapshot.products));
  }

  return { applied: data.applied ?? operations.length, errors: data.errors ?? 0 };
}

/**
 * Полная синхронизация: push очереди, затем pull снимка.
 * Если очередь пустая — делаем один GET вместо трёх запросов.
 */
export async function syncNow(): Promise<{ pushed: number; categories: number; products: number }> {
  const operations = await db.outbox.orderBy("createdAt").toArray();

  if (operations.length === 0) {
    const snapshot = await fetchSnapshot();
    await replaceCache(snapshot.categories, snapshot.products);
    return { pushed: 0, categories: snapshot.categories.length, products: snapshot.products.length };
  }

  const result = await pushOutbox();
  const { categories, products } = await getCachedSnapshot();
  return { pushed: result.applied, categories: categories.length, products: products.length };
}

async function getCachedSnapshot() {
  const [categories, products] = await Promise.all([
    db.categories.orderBy("sortOrder").toArray(),
    db.products.toArray(),
  ]);
  return { categories, products: sortProducts(products) };
}

/**
 * Добавление операции в очередь (для офлайн-мутаций).
 */
export async function queueOperation(op: Omit<SyncOperation, "createdAt">) {
  await db.outbox.add({
    ...op,
    createdAt: new Date().toISOString(),
  } as SyncOperation);
}