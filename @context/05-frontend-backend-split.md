# План: разделение Frontend / Backend (Laravel API)

Документ для дальнейшей работы. Зафиксирован по состоянию монолита Next.js (UI + API routes + Prisma) и целевой схеме: **PWA-фронт + Laravel API на отдельном сервере**.

Связанные файлы: `01-architecture.md`, `02-techstack.md`, `03-decisions.md` (D2, D3, D5, D7), `app/api/sync/route.ts`, `lib/sync.ts`, `lib/types.ts`.

---

## 1. Текущее состояние

Сейчас Stuff — монолит Next.js:

```
Клиент (React + Dexie) ──fetch──▶ Next.js API routes ──Prisma──▶ PostgreSQL (Supabase)
                                      │
                                      └── /api/upload ──▶ Supabase Storage
```

### Что уже «готово» к сплиту

Клиент **почти отделён** от сервера. Живой путь мутаций:

`IndexedDB (Dexie) → outbox → POST /api/sync`

`lib/actions.ts` (Server Actions) в UI **не используется**. Offline-first и LWW на клиенте менять не нужно — в Laravel переносится только серверная логика применения операций.

### Эндпоинты, которые бьёт клиент

| Эндпоинт | Файл | Роль |
|---|---|---|
| `GET /api/sync` | `app/api/sync/route.ts` | Полный снимок (pull) |
| `POST /api/sync` | `app/api/sync/route.ts` | Push outbox + снимок в ответе |
| `GET /api/audit` | `app/api/audit/route.ts` | История (последние 200) |
| `POST /api/upload` | `app/api/upload/route.ts` | Фото → Supabase Storage |

Точки вызова на фронте:

- `lib/sync.ts` — `/api/sync`
- `components/history.tsx` — `/api/audit`
- `components/forms.tsx` — `/api/upload`

---

## 2. Целевая схема

```
┌─────────────────────────────┐         HTTPS + CORS
│  Frontend (отдельный хост)  │ ──────────────────────▶ ┌──────────────────────────────┐
│  Next.js PWA / static       │                         │  Laravel API (отдельный       │
│  Dexie + outbox             │                         │  сервер: Nginx + PHP-FPM)     │
│  NEXT_PUBLIC_API_URL=…      │                         │  Eloquent + PostgreSQL        │
│  без Prisma / без API routes│                         │  Storage (S3 / Supabase /     │
└─────────────────────────────┘                         │  local public disk)           │
                                                        └──────────────────────────────┘
```

| Часть | Что остаётся | Хостинг |
|---|---|---|
| **Frontend** | UI, PWA, Dexie, sync-клиент, тема, аудит-UI | Vercel / static / любой CDN |
| **Backend** | Sync, audit, upload, БД, секреты | Свой сервер (OSPanel / VPS) |
| **PostgreSQL** | Таблицы `categories`, `products`, `audit_logs` | Текущий Supabase или БД на сервере Laravel |
| **Фото** | Публичные URL в `products.photoUrl` | Supabase Storage **или** Laravel Storage/S3 |

---

## 3. Контракт Laravel API (сохранить 1:1)

**Не дробить sync на классический REST CRUD** на первом этапе. Клиент заточен под batch outbox + snapshot в одном POST (см. D7). Смена модели = большая переделка фронта и offline.

### 3.1. `GET /api/sync` — pull

Ответ:

```json
{
  "ok": true,
  "serverTime": "2026-08-14T12:00:00.000Z",
  "categories": [ /* Category[] */ ],
  "products": [ /* Product[] */ ]
}
```

Сортировка: категории по `sortOrder ASC`; товары по `sortOrder ASC`, затем `name ASC`.

### 3.2. `POST /api/sync` — push outbox

Тело:

```json
{
  "operations": [
    {
      "type": "setStockStatus",
      "id": "<uuid сущности>",
      "payload": { "...": "..." },
      "createdAt": "2026-08-14T12:00:00.000Z"
    }
  ]
}
```

Ответ (снимок в том же ответе — обязательно):

```json
{
  "ok": true,
  "applied": 3,
  "errors": 0,
  "snapshot": {
    "categories": [],
    "products": [],
    "serverTime": "2026-08-14T12:00:01.000Z"
  }
}
```

Если `ok === false` или `errors > 0` — клиент **не** очищает outbox и **не** перезаписывает кэш снимком (`lib/sync.ts`).

### 3.3. Типы операций outbox

Источник правды: `lib/types.ts`. Эталон применения: `applyOp` в `app/api/sync/route.ts`.

| `type` | Сущность | Ключевые правила |
|---|---|---|
| `createCategory` | Category | upsert по client UUID; `sortOrder` из payload |
| `updateCategory` | Category | upsert; аудит UPDATE |
| `deleteCategory` | Category | delete; аудит DELETE |
| `createProduct` / `updateProduct` | Product | upsert; `sortOrder` при create; аудит CREATE/UPDATE |
| `deleteProduct` | Product | delete; аудит DELETE |
| `setStockStatus` | Product | **LWW**: применять только если `op.createdAt >= product.updatedAt`; писать `updatedAt = opTime`; аудит SET_STATUS с подписями из STATUS_LABELS |
| `reorderProducts` | Product[] | payload: `{ categoryId, orderedIds[] }`; полный порядок; id не из категории — в конец (remainder); **без аудита** |
| `reorderCategories` | Category[] | payload: `{ orderedIds[] }`; remainder в конец; **без аудита** |

Имя пользователя: `payload.updatedBy` или `"Аноним"`.

Статусы: `SUFFICIENT` \| `LOW` \| `OUT` \| `CRITICAL` (цикл как в `lib/constants.ts`).

### 3.4. `GET /api/audit`

```json
{
  "ok": true,
  "logs": [ /* последние 200, createdAt — ISO-строка */ ]
}
```

### 3.5. `POST /api/upload`

- `multipart/form-data`: поля `file`, `productId`
- лимит 5 МБ (как сейчас)
- ответ: `{ "ok": true, "url": "https://..." }`

Реализация: Laravel → Supabase Storage (service role) **или** сохранение на диск/S3 с публичным URL.

---

## 4. Модели Eloquent / схема БД

Перенос 1:1 из `prisma/schema.prisma`:

- `categories` — `id` (uuid PK), `name`, `sortOrder`, `createdAt`, `updatedAt`
- `products` — `id`, `categoryId` (FK cascade), `name`, `description`, `photoUrl`, `stockStatus` (enum), `sortOrder`, `updatedAt`, `updatedBy`, `createdAt`
- `audit_logs` — `id`, `action`, `entity`, `entityId`, `oldValue`, `newValue`, `userName`, `createdAt`

Индексы — как в Prisma. Миграции Laravel: либо новые migration-файлы по существующей схеме, либо подключение к уже мигрированной Supabase-БД без пересоздания таблиц.

Даты в JSON — **ISO-строки** (как отдаёт текущий Next API).

---

## 5. Изменения на фронте (Next)

1. **Базовый URL API** через env:
   ```env
   NEXT_PUBLIC_API_URL=https://api.example.com
   ```
   Все `fetch("/api/...")` → `fetch(\`${process.env.NEXT_PUBLIC_API_URL}/api/...\`)`  
   Файлы: `lib/sync.ts`, `components/history.tsx`, `components/forms.tsx`.  
   Удобно вынести хелпер `lib/api.ts` (`apiUrl(path)`).

2. **Удалить серверный бэкенд из Next** (после переключения):
   - `app/api/**`
   - `lib/prisma.ts`, `lib/actions.ts`, `lib/data.ts` (если не нужны)
   - Prisma (`prisma/`, `generated/prisma/`), зависимости `@prisma/*`
   - env: `DATABASE_URL`, при переносе upload — `SUPABASE_SERVICE_ROLE_KEY`

3. **CORS** на Laravel: origin фронта (Vercel / локальный dev), методы GET/POST, заголовки `Content-Type`, для upload — `multipart`.

4. **Service Worker** (`public/sw.js`): network-first для API должен ходить на новый host; мутации не кэшировать.

5. Next можно оставить как SPA/PWA (SSR данных не требуется — offline-first).

---

## 6. Репозитории и деплой

| Вариант | Описание |
|---|---|
| **A (проще)** | Два репо: `stuff-web` + `stuff-api` |
| **B** | Monorepo: `apps/web` + `apps/api` |

| Слой | Где крутить |
|---|---|
| Frontend | Vercel / static |
| Laravel | Свой сервер (Nginx + PHP-FPM), в т.ч. OSPanel для локалки |
| PostgreSQL | Оставить Supabase pooler **или** Postgres на сервере Laravel |
| Фото | Supabase Storage или Laravel public/S3 |

Локальная разработка: фронт `localhost:3000`, API `localhost:8080` (или домен OSPanel), `NEXT_PUBLIC_API_URL` на API.

---

## 7. Поэтапный план работ

- [ ] **Контракт** — зафиксировать OpenAPI/Postman по трём роутам + примеры outbox-операций (этот документ — черновик контракта).
- [ ] **Laravel stub** — те же JSON-ответы (можно с фикстурами); фронт с `NEXT_PUBLIC_API_URL` ходит на stub.
- [ ] **Порт `applyOp`** — главный риск: upsert по UUID, LWW `setStockStatus`, reorder + remainder, аудит.
- [ ] **Audit + Upload** — эндпоинты и storage.
- [ ] **Миграции Eloquent** / подключение к существующей БД; сверка счётчиков categories/products/audit_logs.
- [ ] **CORS + HTTPS** на API; проверка с реального origin фронта.
- [ ] **Переключить фронт** на Laravel; smoke: offline → online sync, reorder, статусы, фото, история.
- [ ] **Вырезать** Prisma и `app/api/*` из Next; убрать серверные секреты из env фронта.
- [ ] **(Опционально)** защита API: Sanctum / shared API key / простой Bearer — сейчас auth нет, только `userName` в payload; публичный API без ключа рискован.

---

## 8. Риски и правила

1. **Не менять контракт sync** без одновременной правки клиента — иначе потеряется outbox или сломается LWW.
2. **Client-generated UUID** обязателен (создание офлайн) — сервер не должен генерировать новый id при create.
3. **Один POST вместо цепочки** push→pull — сохранять `snapshot` в ответе POST (D7).
4. **Каскад** удаления категории → товары.
5. **Подписи статусов в аудите** — те же, что в UI (`STATUS_LABELS`: Есть / Мало / Нет / Критично).
6. Latency: Laravel рядом с БД может быть быстрее, чем Vercel Lambda + холодный старт.

---

## 9. Карта файлов для портирования

| Сейчас (Next) | Куда в Laravel (ориентир) |
|---|---|
| `app/api/sync/route.ts` (`GET`/`POST`, `applyOp`) | `SyncController` + `ApplySyncOperation` (service/action) |
| `app/api/audit/route.ts` | `AuditController@index` |
| `app/api/upload/route.ts` | `UploadController@store` |
| `prisma/schema.prisma` | Eloquent models + migrations |
| `lib/constants.ts` (`STATUS_*`) | PHP enum / config (дублировать подписи для аудита) |
| `lib/sync.ts`, `history.tsx`, `forms.tsx` | только смена base URL на фронте |

Эталонная логика сервера — **скопировать поведение** `applyOp`, не «улучшать» семантику в первом проходе.

---

## 10. Критерии готовности

- Фронт с `NEXT_PUBLIC_API_URL` работает против Laravel без Next API routes.
- Офлайн-изменения уходят в outbox и применяются после появления сети.
- Быстрые тапы статуса и drag-n-drop не ломаются (сервер принимает коалесцированные/reorder-операции).
- История и загрузка фото работают.
- В env фронта нет `DATABASE_URL` / service-role ключей.

---

## 11. Статус

| Поле | Значение |
|---|---|
| Статус | Черновик плана (реализация не начата) |
| Дата | 2026-08-14 |
| Следующий шаг | Laravel stub `GET/POST /api/sync` + `NEXT_PUBLIC_API_URL` на фронте |
