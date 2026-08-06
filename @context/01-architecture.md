# Архитектура проекта

## Общая схема

```
┌─────────────┐   PWA (браузер, офлайн-first)
│  Клиент      │
│  ──────────  │
│  React 19    │
│  useInventory│──▶ Dexie (IndexedDB): categories, products, outbox
│  (хук)       │    └─ локальный кэш для мгновенного UI
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
                  │  products            │
                  │  audit_logs          │
                  └──────────────────────┘

Фото: клиент ──POST /api/upload──▶ Supabase Storage (bucket "products", public)
```

## Поток данных (онлайн)

1. Клиент открывает приложение → `useInventory` грузит кэш из IndexedDB (мгновенно), затем `syncNow()` тянет свежий снимок `GET /api/sync`.
2. Периодически (каждые 10 сек) `useInventory` вызывает `syncNow()` — обновляет кэш и подтягивает изменения других устройств.
3. События `online`/`offline` → синхронизация сразу при появлении сети.
4. Ручная кнопка ⟳ в шапке тоже вызывает синхронизацию.

## Поток данных (офлайн)

1. Пользователь тапает статус → `setStockStatusLocal()`:
   - обновляет запись в IndexedDB (мгновенный отклик UI);
   - добавляет операцию `setStockStatus` в таблицу `outbox`.
2. При появлении сети `syncNow()` отправляет все операции из `outbox` одним POST на `/api/sync`.
3. Сервер применяет операции (last-write-wins по `updatedAt`/`createdAt`) и **возвращает свежий снимок** в том же ответе.
4. Клиент очищает `outbox` и заменяет локальный кэш снимком.

## Ключевые модули

| Файл | Назначение |
|---|---|
| `components/inventory.tsx` | Главный экран: списки, фильтры, поиск, модалки |
| `components/forms.tsx` | Формы категории/товара, загрузка фото |
| `components/stock-indicator.tsx` | Цветная кнопка статуса (тап = смена) |
| `components/history.tsx` | Окно истории изменений |
| `components/modal.tsx` | Мобильная модалка (bottom sheet) |
| `components/pwa-register.tsx` | Регистрация Service Worker |
| `hooks/use-inventory.ts` | Офлайн-first хук: кэш + периодическая синхронизация; локальные мутации |
| `hooks/use-user.ts` | Имя пользователя (localStorage) |
| `lib/db.ts` | Схема Dexie (categories, products, outbox) |
| `lib/sync.ts` | Push/pull синхронизация (`syncNow`, `pushOutbox`) |
| `lib/actions.ts` | Server Actions (используются как альтернатива API, в т.ч. для формы) |
| `lib/prisma.ts` | Prisma Client singleton с `@prisma/adapter-pg` |
| `lib/constants.ts` | Статусы, цвета, интервал синхронизации (10 сек) |
| `lib/types.ts` | Общие типы (Category, Product, SyncOperation…) |
| `app/api/sync/route.ts` | GET — снимок; POST — приём outbox + возврат снимка |
| `app/api/audit/route.ts` | GET — последние 200 записей аудита |
| `app/api/upload/route.ts` | POST — загрузка фото в Supabase Storage |

## Примечания
- Наличие: `SUFFICIENT` / `LOW` / `OUT` (в `prisma/schema.prisma` — enum `StockStatus`).
- Запрос синхронизации оптимизирован: **1 POST вместо 3 запросов** (сервер возвращает снимок в ответе на push).
- `updatedAt` у товара — источник true для last-write-wins.