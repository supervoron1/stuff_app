"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DndContext, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { useInventory, setStockStatusLocal, createCategoryLocal, updateCategoryLocal, deleteCategoryLocal, createProductLocal, updateProductLocal, deleteProductLocal, reorderProductsLocal } from "@/hooks/use-inventory";
import { useUser } from "@/hooks/use-user";
import { StockCheck } from "./stock-check";
import { Modal } from "./modal";
import { CategoryForm, ProductForm } from "./forms";
import { History } from "./history";
import { STATUS_CYCLE, STATUS_LABELS } from "@/lib/constants";
import { syncNow } from "@/lib/sync";
import type { Category, Product, StockStatus } from "@/lib/types";

type Filter = "ALL" | StockStatus;

// Ряд товара с перетаскиванием за ручку ⠿ (dnd-kit).
function ProductRow({ product, disabled, onEdit, onDelete, onCycle }: { product: Product; disabled: boolean; onEdit: VoidFunction; onDelete: VoidFunction; onCycle: VoidFunction; }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: product.id, disabled });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center justify-between gap-2 py-2 ${isDragging ? "relative z-10 opacity-80" : ""}`}
    >
      {/* Drag-зона: ручка ⠿ + название товара. Кнопки справа (статус, ✎, ✕) не перехватываются. */}
      <div
        {...attributes}
        {...listeners}
        aria-label={disabled ? undefined : `Переместить «${product.name}»`}
        className={`flex min-w-0 flex-1 cursor-grab items-center gap-2 active:cursor-grabbing ${disabled ? "" : "touch-manipulation"}`}
      >
        {!disabled && <span className="shrink-0 text-gray-400">⠿</span>}
        {product.photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={product.photoUrl} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover" />
        )}
        <div className="min-w-0">
          <p className="truncate font-medium text-gray-900">{product.name}</p>
          {product.description && <p className="truncate text-xs text-gray-500">{product.description}</p>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <StockCheck status={product.stockStatus} interactive onCycle={onCycle} />
        <button onClick={onEdit} className="rounded-lg px-2 py-1 text-gray-400 hover:bg-gray-100">✎</button>
        <button onClick={onDelete} className="rounded-lg px-2 py-1 text-red-400 hover:bg-red-50">✕</button>
      </div>
    </li>
  );
}

export function InventoryApp() {
  const { categories, products, loading, online, pendingOps, refresh, refreshLocal, optimisticReorder, optimisticSetStatus } = useInventory();
  const { userName, setUserName } = useUser();

  const [filter, setFilter] = useState<Filter>("ALL");
  const [search, setSearch] = useState("");

  // Аккордеон категорий: множество id свёрнутых категорий (по умолчанию все развёрнуты).
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

  // Модалки
  const [categoryModal, setCategoryModal] = useState<{ open: boolean; editing: Category | null }>({ open: false, editing: null });
  const [productModal, setProductModal] = useState<{ open: boolean; categoryId: string; editing: Product | null }>({ open: false, categoryId: "", editing: null });
  const [deleteModal, setDeleteModal] = useState<{ category: Category | null; product: Product | null }>({ category: null, product: null });
  const [userModal, setUserModal] = useState(false);
  const [userInput, setUserInput] = useState(userName);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleSync = useCallback(() => {
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      syncTimerRef.current = null;
      if (online) {
        refresh().catch(() => {});
      }
    }, 400);
  }, [online, refresh]);

  const productsByCategory = useMemo(() => {
    const map = new Map<string, Product[]>();
    for (const p of products) {
      if (filter !== "ALL" && p.stockStatus !== filter) continue;
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) continue;
      const list = map.get(p.categoryId) ?? [];
      list.push(p);
      map.set(p.categoryId, list);
    }
    return map;
  }, [products, filter, search]);

  // Категории для показа с учётом выбранного фильтра:
  // при конкретном статусе — только те, где есть хотя бы один товар с этим статусом.
  const visibleCategories = useMemo(() => {
    // «Все» и без поиска — показываем все категории (включая пустые, чтобы можно было добавить первый товар).
    if (filter === "ALL" && search.trim() === "") return categories;
    // Фильтр по статусу и/или поиск — только категории, где есть подходящие товары.
    return categories.filter((cat) => (productsByCategory.get(cat.id)?.length ?? 0) > 0);
  }, [categories, filter, search, productsByCategory]);

  // При активном фильтре статуса или непустом поиске категории принудительно
  // развёрнуты, чтобы отфильтрованные товары были сразу видны.
  const forceExpand = filter !== "ALL" || search.trim() !== "";

  const isCategoryExpanded = (id: string) => forceExpand || !collapsedIds.has(id);

  const toggleCategory = (id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Все ли видимые категории свёрнуты (для подписи кнопки «Свернуть все/Развернуть все»).
  const allCollapsed =
    visibleCategories.length > 0 && visibleCategories.every((cat) => collapsedIds.has(cat.id));

  const toggleAll = () => {
    if (allCollapsed) {
      setCollapsedIds(new Set());
    } else {
      setCollapsedIds(new Set(visibleCategories.map((cat) => cat.id)));
    }
  };

  const counts = useMemo(() => {
    const c = { SUFFICIENT: 0, LOW: 0, OUT: 0, total: products.length };
    for (const p of products) c[p.stockStatus]++;
    return c;
  }, [products]);

  const showMsg = (text: string) => {
    setMsg(text);
    setTimeout(() => setMsg(""), 2500);
  };

  // Актуальный статус при быстрых тапах + таймеры отложенной записи.
  const pendingStatusRef = useRef<Map<string, StockStatus>>(new Map());
  const statusTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  useEffect(() => {
    return () => {
      statusTimersRef.current.forEach((t) => clearTimeout(t));
    };
  }, []);

  function cycleStatus(product: Product) {
    // Следующий статус считаем от последнего «запушенного» тапом, а не от устаревшего рендера.
    const current = pendingStatusRef.current.get(product.id) ?? product.stockStatus;
    const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(current) + 1) % STATUS_CYCLE.length];
    // 1) Мгновенное (оптимистичное) обновление UI — тапы не «съедаются» ожиданием сети/БД.
    pendingStatusRef.current.set(product.id, next);
    optimisticSetStatus(product.id, next, userName || "Аноним");

    // 2) Отложенная запись: при быстрых тапах в IndexedDB/outbox попадает только финальный статус.
    const existing = statusTimersRef.current.get(product.id);
    if (existing) clearTimeout(existing);
    statusTimersRef.current.set(
      product.id,
      setTimeout(() => {
        statusTimersRef.current.delete(product.id);
        const final = pendingStatusRef.current.get(product.id);
        if (!final) return;
        pendingStatusRef.current.delete(product.id);
        void setStockStatusLocal(product.id, final, userName || "Аноним").then(() => refreshLocal());
        scheduleSync();
      }, 300)
    );
  }

  async function handleCategorySubmit(id: string, name: string) {
    if (categoryModal.editing) {
      await updateCategoryLocal(id, name, userName || null);
      showMsg("Категория обновлена");
    } else {
      const sortOrder = categories.length;
      await createCategoryLocal(id, name, sortOrder, userName || null);
      showMsg("Категория создана");
    }
    await refresh();
  }

  async function handleProductSubmit(id: string, data: { name: string; description: string | null; photoUrl: string | null }) {
    const catId = productModal.categoryId;
    if (productModal.editing) {
      await updateProductLocal(id, data.name, data.description, data.photoUrl, userName || null);
      showMsg("Товар обновлён");
    } else {
      await createProductLocal(id, catId, data.name, data.description, data.photoUrl, userName || null);
      showMsg("Товар добавлен");
    }
    await refresh();
  }

  async function handleDelete() {
    const { category, product } = deleteModal;
    if (category) {
      await deleteCategoryLocal(category.id, userName || null);
      showMsg("Категория удалена");
    } else if (product) {
      await deleteProductLocal(product.id, userName || null);
      showMsg("Товар удалён");
    }
    setDeleteModal({ category: null, product: null });
    await refresh();
  }

  async function handleSync() {
    try {
      await syncNow();
      await refresh();
      showMsg("Синхронизировано");
    } catch {
      showMsg("Нет соединения");
    }
  }

  const reorderDisabled = filter !== "ALL" || search.trim() !== "";
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  );
  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const activeProduct = products.find((p) => p.id === active.id);
    const overProduct = products.find((p) => p.id === over.id);
    if (!activeProduct || !overProduct || activeProduct.categoryId !== overProduct.categoryId) return;
    const categoryId = activeProduct.categoryId;
    const current = productsByCategory.get(categoryId);
    if (!current) return;
    const fromIndex = current.findIndex((p) => p.id === active.id);
    const toIndex = current.findIndex((p) => p.id === over.id);
    if (fromIndex === -1 || toIndex === -1) return;
    const orderedIds = arrayMove(current, fromIndex, toIndex).map((p) => p.id);

    // 1) Оптимистично: сразу ставим товары в новый порядок в UI (без ожидания сети/БД).
    optimisticReorder(categoryId, orderedIds);

    // 2) Пишем в IndexedDB + outbox и подтверждаем из локального кэша.
    try {
      await reorderProductsLocal(categoryId, orderedIds, userName || null);
      await refreshLocal();
    } catch {
      // При ошибке локальной записи возвращаем порядок из кэша и сообщаем.
      await refreshLocal();
      showMsg("Не удалось изменить порядок");
      return;
    }

    // 3) Фоновая отправка на сервер с debounce (операция уже в outbox).
    scheduleSync();
  }
  if (loading) {
    return <div className="flex items-center justify-center py-24 text-gray-500">Загрузка...</div>;
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 pb-24 pt-4">
      {/* Шапка */}
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Наличие товаров</h1>
          <p className="text-xs text-gray-500">
            {online ? "● в сети" : "○ офлайн"}
            {pendingOps > 0 && ` · ожидает: ${pendingOps}`}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setHistoryOpen(true)}
            className="rounded-xl border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 active:scale-95"
            title="История"
          >
            🕘
          </button>
          <button
            onClick={handleSync}
            className="rounded-xl border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 active:scale-95"
            title="Синхронизировать"
          >
            ⟳
          </button>
          <button
            onClick={() => { setUserInput(userName); setUserModal(true); }}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-green-600 text-sm font-bold text-white"
            title="Сменить пользователя"
          >
            {userName ? userName[0].toUpperCase() : "?"}
          </button>
        </div>
      </div>

      {msg && <div className="mb-3 rounded-xl bg-green-50 px-3 py-2 text-center text-sm text-green-700">{msg}</div>}

      {/* Поиск и фильтры */}
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Поиск товаров..."
        className="mb-3 w-full rounded-xl border border-gray-300 px-4 py-2.5 text-base outline-none focus:border-green-500"
      />

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {(["ALL", "SUFFICIENT", "LOW", "OUT"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium ${filter === f ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700"}`}
          >
            {f === "ALL" ? `Все (${counts.total})` : `${STATUS_LABELS[f]} (${counts[f]})`}
          </button>
        ))}
      </div>

      {/* Свернуть/развернуть все категории */}
      {visibleCategories.length > 0 && (
        <div className="mb-3 flex justify-end">
          <button
            type="button"
            onClick={toggleAll}
            disabled={forceExpand}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {allCollapsed ? "Развернуть все" : "Свернуть все"}
          </button>
        </div>
      )}

      {/* Категории с товарами */}
      {categories.length === 0 && (
        <div className="py-10 text-center text-gray-500">
          <p className="mb-4">Категорий пока нет</p>
          <button
            onClick={() => setCategoryModal({ open: true, editing: null })}
            className="rounded-xl bg-green-600 px-5 py-2.5 font-medium text-white"
          >
            + Создать категорию
          </button>
        </div>
      )}

      {/* Глобальное пустое состояние при активном фильтре статуса или поиске */}
      {(filter !== "ALL" || search.trim() !== "") && categories.length > 0 && visibleCategories.length === 0 && (
        <div className="py-10 text-center text-gray-500">
          <p>{search.trim() !== "" ? `Ничего не найдено по запросу «${search.trim()}»` : "Нет товаров с таким статусом"}</p>
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        {visibleCategories.map((cat) => {
        const items = productsByCategory.get(cat.id) ?? [];
        const expanded = isCategoryExpanded(cat.id);
        return (
          <div key={cat.id} className="mb-4 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
            <div className="mb-2 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => toggleCategory(cat.id)}
                aria-expanded={expanded}
                className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
              >
                <span className="shrink-0 text-sm text-gray-400">{expanded ? "▾" : "▸"}</span>
                <span className="truncate font-semibold text-gray-900">{cat.name}</span>
                {items.length > 0 && (
                  <span className="shrink-0 text-xs font-normal text-gray-400">{items.length}</span>
                )}
              </button>
              <div className="flex shrink-0 gap-1">
                <button
                  onClick={() => setCategoryModal({ open: true, editing: cat })}
                  className="rounded-lg px-2 py-1 text-sm text-gray-500 hover:bg-gray-100"
                >
                  ✎
                </button>
                <button
                  onClick={() => setDeleteModal({ category: cat, product: null })}
                  className="rounded-lg px-2 py-1 text-sm text-red-500 hover:bg-red-50"
                >
                  ✕
                </button>
                <button
                  onClick={() => {
                    // При создании товара сбрасываем фильтр статуса на «Все»,
                    // иначе новый товар (по умолчанию «Достаточно») не будет виден в списке.
                    setFilter("ALL");
                    // Разворачиваем категорию, чтобы новый товар был сразу виден.
                    setCollapsedIds((prev) => {
                      const next = new Set(prev);
                      next.delete(cat.id);
                      return next;
                    });
                    setProductModal({ open: true, categoryId: cat.id, editing: null });
                  }}
                  className="rounded-lg px-2 py-1 text-sm text-green-600 hover:bg-green-50"
                >
                  +
                </button>
              </div>
            </div>

            <div
              className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
            >
              <div className="min-h-0 overflow-hidden">
                {items.length === 0 ? (
                  <p className="py-2 text-sm text-gray-400">Нет товаров</p>
                ) : (
                  <SortableContext items={items.map((p) => p.id)} strategy={verticalListSortingStrategy}>
                    <ul className="divide-y divide-gray-100">
                    {items.map((p) => (
                        <ProductRow
                          key={p.id}
                          product={p}
                          disabled={reorderDisabled || items.length < 2}
                          onEdit={() => setProductModal({ open: true, categoryId: p.categoryId, editing: p })}
                          onDelete={() => setDeleteModal({ category: null, product: p })}
                          onCycle={() => cycleStatus(p)}
                        />
                    ))}
                    </ul>
                  </SortableContext>
                )}
              </div>
            </div>
          </div>
        );
      })}

      </DndContext>

      {/* Плавающая кнопка добавления категории */}
      {categories.length > 0 && (
        <button
          onClick={() => setCategoryModal({ open: true, editing: null })}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-green-600 px-6 py-3 font-semibold text-white shadow-lg active:scale-95"
        >
          + Категория
        </button>
      )}

      {/* Модалки */}
      <CategoryForm
        open={categoryModal.open}
        onClose={() => setCategoryModal({ open: false, editing: null })}
        initial={categoryModal.editing ? { id: categoryModal.editing.id, name: categoryModal.editing.name } : null}
        onSubmit={handleCategorySubmit}
      />

      {productModal.open && (
        <ProductForm
          open={productModal.open}
          onClose={() => setProductModal({ open: false, categoryId: "", editing: null })}
          categoryId={productModal.categoryId}
          existingPhotoUrl={productModal.editing?.photoUrl ?? null}
          initial={productModal.editing ? { id: productModal.editing.id, name: productModal.editing.name, description: productModal.editing.description } : null}
          onSubmit={handleProductSubmit}
        />
      )}

      <Modal open={!!deleteModal.category || !!deleteModal.product} title="Подтверждение" onClose={() => setDeleteModal({ category: null, product: null })}>
        <p className="mb-4 text-gray-700">
          Удалить {deleteModal.category ? `категорию «${deleteModal.category.name}» со всеми товарами` : deleteModal.product ? `товар «${deleteModal.product.name}»` : ""}?
        </p>
        <div className="flex gap-3">
          <button onClick={() => setDeleteModal({ category: null, product: null })} className="flex-1 rounded-xl border border-gray-300 py-2.5 font-medium text-gray-700">
            Отмена
          </button>
          <button onClick={handleDelete} className="flex-1 rounded-xl bg-red-600 py-2.5 font-medium text-white">
            Удалить
          </button>
        </div>
      </Modal>

      <History open={historyOpen} onClose={() => setHistoryOpen(false)} />

      <Modal open={userModal} title="Ваше имя" onClose={() => setUserModal(false)}>
        <div className="space-y-4">
          <p className="text-sm text-gray-500">Имя будет записываться в историю изменений.</p>
          <input
            type="text"
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            placeholder="Например: Иван"
            className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-base outline-none focus:border-green-500"
            autoFocus
          />
          <button
            onClick={() => { setUserName(userInput); setUserModal(false); }}
            className="w-full rounded-xl bg-green-600 py-2.5 font-medium text-white"
          >
            Сохранить
          </button>
        </div>
      </Modal>
    </div>
  );
}