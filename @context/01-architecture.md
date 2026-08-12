# Архитектура проекта

## Общая схема

```
┌─────────────┐   PWA (браузер, офлайн-first)
│  Клиент      │
│  ──────────  │
│  React 19    │
│  useInventory│──▶ Dexie (IndexedDB): categories, products, outbox
│  (хук)       │    └─ локальный кэш для мгновенного UI
│  useTheme    │──▶ localStorage: настройка темы (light/dark/system)
│              │
│  Действия    │──▶ fetch /api/sync (POST push / GET pull)
│  (локальные) │──▶ fetch /api/audit (история)
└──────┬───────┘──▶ fetch /api/upload (фото, только онлайн)
       │
       │  HTTPS
       ▼
┌─────────────┐     ┌──────────────────────┐
│  Next.js 16 │     │  Prisma 7 Client     │
│  (Vercel)   │────▶│  @prisma/adapter-pg  │
│  API routes │     └──────────┬───────────┘
└─────────────┘                ▼
                  ┌──────────────────────┐
                  │  PostgreSQL (Neon)   │
                  │  categories          │
                  │  products (sortOrder)│
                  │  audit_logs          │
                  └──────────────────────┘

Фото: клиент ──POST /api/upload──▶ Supabase Storage (bucket "products", public)
```

## Поток данных (онлайн)

1. Клиент открывает приложение → `useInventory` грузит кэш из IndexedDB (мгновенно), затем `syncNow()` тянет свежий снимок `GET /api/sync`.
2. Периодически (каждые 10 сек) `useInventory` вызывает `syncNow()` — обновляет кэш и подтягивает изменения других устройств.
3. События `online`/`offline` → синхронизация сразу при появлении сети.
4. Ручная кнопка ⟳ в шапке тоже вызывает синхронизацию.
5. `doSync` защищён от гонки: если во время синхронизации в outbox добавились новые операции, выполняется повторный проход (до 3 раз; `pendingSyncRef` — ещё один проход сразу после занятой синхронизации).

## Поток данных (офлайн)

1. **Смена статуса** (тап по галочке):
   - `cycleStatus` считает следующий статус от последнего «запушенного» тапом (`pendingStatusRef`) и мгновенно обновляет UI через `optimisticSetStatus`;
   - отложенная запись (debounce 300 мс): в IndexedDB + outbox попадает только финальный статус серии тапов;
   - `setStockStatusLocal` добавляет операцию `setStockStatus` (с коалесингом — для товара остаётся только последняя операция).
2. **Перетаскивание категории** (drag-n-drop за весь заголовок: шеврон + ручка ⠿ + название + счётчик):
   - `optimisticReorderCategories` мгновенно перестраивает порядок категорий в state;
   - `reorderCategoriesLocal` проставляет `sortOrder` 0..N в IndexedDB и кладёт в outbox операцию `reorderCategories` (полный список id в новом порядке);
   - фоновая отправка — `scheduleSync` (debounce 400 мс).
3. **Перетаскивание товара** (drag-n-drop за ручку ⠿ + название):
   - `optimisticReorder` мгновенно перестраивает порядок в state;
   - `reorderProductsLocal` проставляет `sortOrder` 0..N в IndexedDB и кладёт в outbox операцию `reorderProducts` (полный список id в новом порядке);
   - фоновая отправка — `scheduleSync` (debounce 400 мс).
3. При появлении сети `syncNow()` отправляет все операции из `outbox` одним POST на `/api/sync`.
4. Сервер применяет операции (last-write-wins по `updatedAt`/`createdAt`; `reorderProducts` — LWW на уровне категории) и **возвращает свежий снимок** в том же ответе.
5. Клиент очищает `outbox` и заменяет локальный кэш снимком.

## Ключевые модули

| Файл | Назначение |
|---|---|
| `components/inventory.tsx` | Главный экран: аккордеон категорий, фильтры и поиск (скрытие категорий без совпадений), drag-n-drop (@dnd-kit), оптимистичные reorder/статус, модалки, переключатель темы |
| `components/forms.tsx` | Формы категории/товара, загрузка фото |
| `components/stock-check.tsx` | Галочка ✓ цветом по статусу (тап = смена); цвета через CSS-переменные (адаптация к теме) |
| `components/stock-indicator.tsx` | Старый индикатор-«пилюля» (не используется, оставлен по просьбе дизайнера; поддерживает тему) |
| `components/history.tsx` | Окно истории изменений |
| `components/modal.tsx` | Мобильная модалка (bottom sheet) |
| `components/pwa-register.tsx` | Регистрация Service Worker + механизм обновления PWA (баннер «Доступна новая версия», периодическая проверка) |
| `components/scroll-to-top.tsx` | Плавающая кнопка «наверх» внизу справа |
| `hooks/use-inventory.ts` | Офлайн-first хук: кэш + периодическая синхронизация; локальные мутации; `optimisticReorder`/`optimisticSetStatus` |
| `hooks/use-theme.ts` | Тема приложения: light/dark/system, localStorage, анти-flash, обновление `meta theme-color` |
| `hooks/use-user.ts` | Имя пользователя (localStorage) |
| `lib/db.ts` | Схема Dexie (categories, products с индексом sortOrder, outbox) |
| `lib/sync.ts` | Push/pull синхронизация (`syncNow`, `pushOutbox`), сортировка товаров по sortOrder |
| `lib/data.ts` | Чтение данных с сервера (сортировка по sortOrder) |
| `lib/actions.ts` | Server Actions (используются как альтернатива API, в т.ч. для формы) |
| `lib/prisma.ts` | Prisma Client singleton с `@prisma/adapter-pg` |
| `lib/constants.ts` | Статусы, цвета, интервал синхронизации (10 сек) |
| `lib/types.ts` | Общие типы (Category, Product с sortOrder, SyncOperation, в т.ч. reorderProducts…) |
| `app/api/sync/route.ts` | GET — снимок; POST — приём outbox (в т.ч. reorderProducts) + возврат снимка |
| `app/api/audit/route.ts` | GET — последние 200 записей аудита |
| `app/api/upload/route.ts` | POST — загрузка фото в Supabase Storage |
| `public/sw.js` | Service Worker: версия кэша, network-first, обработка `SKIP_WAITING` для обновления PWA |
| `app/manifest.ts` | PWA-манифест (стабильный `id`) |
| `app/globals.css` | Tailwind 4: `@custom-variant dark`, CSS-переменные статусов для обеих тем |

## Примечания

- Наличие: `SUFFICIENT` (🟢 есть) / `LOW` (🟡 мало) / `OUT` (🔴 нет) / `CRITICAL` (🔴 «!» критично) — enum `StockStatus` в `prisma/schema.prisma`; подписи UI — `lib/constants.ts`.
- **Порядок категорий**: поле `Category.sortOrder`; drag-n-drop за весь заголовок категории (шеврон + ручка ⠿ + название + счётчик); операция `reorderCategories` несёт полный список id и целиком заменяет `sortOrder` (LWW на глобальном уровне). Новая категория создаётся в конец списка (`sortOrder = max+1`).
- **Порядок товаров**: поле `Product.sortOrder`; drag-n-drop за ручку ⠿ + название (только внутри категории); операция `reorderProducts` несёт полный список id и целиком заменяет `sortOrder` (LWW на уровне категории). Новый товар создаётся в конец категории (`sortOrder = max+1`).
- **Перетаскивание** доступно только в режиме «Все» и без поиска (и для категорий, и для товаров); сенсоры: MouseSensor (мышь, сдвиг 6px) + TouchSensor (долгий тап 200 мс для тач-устройств, чтобы не блокировать прокрутку).
- **Drag-зона**: товар — ручка ⠿ + название (кнопки статуса/✎/✕ вне зоны); категория — весь заголовок (кнопки ✎/✕/+ вне зоны). Короткий тап по заголовку категории сворачивает/разворачивает, долгий тап — перетаскивание.
- **Коллизии**: один `DndContext` на страницу + два `SortableContext` (категории и товары); кастомный collision detection разделяет droppable-контейнеры по типу активного элемента (категория → только категории, товар → только товары).
- **Фильтры и поиск**: `visibleCategories` показывает только категории с подходящими товарами (при фильтре статуса или непустом поиске); при «Все» без поиска пустые категории остаются видимыми (чтобы добавить первый товар); пустое состояние — «Нет товаров с таким статусом» / «Ничего не найдено по запросу».
- **Оптимистичный UI**: смена статуса и перетаскивание обновляют интерфейс мгновенно (без ожидания сети/БД); запись в IndexedDB/outbox и синхронизация — в фоне с debounce.
- **Тема**: class-based dark mode (`.dark` на `<html>`); выбор light/dark/system хранится в localStorage; статусы через CSS-переменные (`--status-sufficient/low/out/critical`), в тёмной теме осветляются; акцентные кнопки в dark — `green-500`.
- **Обновление PWA**: версия кэша в `sw.js`; клиент проверяет новую версию каждые 60 сек (и на `focus`/`visibilitychange`), показывает баннер «Доступна новая версия»; по «Обновить» — `SKIP_WAITING` + перезагрузка.
- Запрос синхронизации оптимизирован: **1 POST вместо 3 запросов** (сервер возвращает снимок в ответе на push).
- `updatedAt` у товара — источник true для last-write-wins.