# Технологический стек и схема данных

## Стек

| Технология | Версия | Назначение |
|---|---|---|
| Next.js | 16.3.0 | App Router, SSR, Server Actions, API routes |
| React | 19.2.8 | UI |
| TypeScript | 5.9.3 | Типизация (strict) |
| Tailwind CSS | 4 | Стили (class-based dark mode через `@custom-variant dark`) |
| Prisma | 7.9.1 | ORM (новый генератор `prisma-client`, driver adapter `@prisma/adapter-pg`) |
| PostgreSQL | — | Neon (бесплатный хостинг, IPv4) |
| Supabase JS | — | Storage (фото товаров), bucket `products`, public |
| Dexie | — | IndexedDB: локальный кэш + очередь outbox |
| @dnd-kit | core 6.3.1 / sortable 10.0.0 / utilities 3.2.2 | Drag-n-drop товаров внутри категорий |
| Zod | — | Валидация форм (Server Actions / API) |

## Особенности Prisma 7 (важно!)
- Используется **новый генератор**: `generator client { provider = "prisma-client" output = "../generated/prisma" }`
  → Prisma Client импортируется из `generated/prisma/client`, а не `@prisma/client`.
- **Нет `url` в `schema.prisma`**: подключение задаётся в `prisma.config.ts` через `datasource.url = env("DATABASE_URL")`.
- **Driver adapter обязателен**: в `lib/prisma.ts` используем `new PrismaPg({ connectionString: process.env.DATABASE_URL! })` + `new PrismaClient({ adapter })`.
- Клиент **кешируется в глобальный синглтон** (паттерн для dev/HMR).

## Схема БД (`prisma/schema.prisma`)

```prisma
enum StockStatus { SUFFICIENT LOW OUT }  // UI-подписи: 🟢 Есть / 🟡 Мало / 🔴 Нет

model Category {
  id        String    @id @default(uuid())
  name      String
  sortOrder Int       @default(0)
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  products  Product[]

  @@index([sortOrder])
  @@map("categories")
}

model Product {
  id          String      @id @default(uuid())
  categoryId  String
  name        String
  description String?
  photoUrl    String?
  stockStatus StockStatus @default(SUFFICIENT)
  sortOrder   Int         @default(0)   // ← ручной порядок в категории (drag-n-drop)
  updatedAt   DateTime    @updatedAt    // ← для last-write-wins
  updatedBy   String?
  createdAt   DateTime    @default(now())
  category    Category    @relation(fields: [categoryId], references: [id], onDelete: Cascade)

  @@index([categoryId])
  @@index([categoryId, sortOrder])
  @@index([stockStatus])
  @@map("products")
}

model AuditLog {
  id        String   @id @default(uuid())
  action    String   // CREATE | UPDATE | DELETE | SET_STATUS
  entity    String   // CATEGORY | PRODUCT
  entityId  String?
  oldValue  String?
  newValue  String?
  userName  String
  createdAt DateTime @default(now())

  @@index([entityId])
  @@index([createdAt])
  @@map("audit_logs")
}
```

Ошибки Prisma «Invalid URL» и «P1001» при использовании неправильной `DATABASE_URL` — уже неактуальны (см. `03-decisions.md`).

## Переменные окружения (`.env`)

```env
DATABASE_URL="postgresql://neondb_owner:ПАРОЛЬ@ep-...eu-central-1.aws.neon.tech/neondb?sslmode=require"
NEXT_PUBLIC_SUPABASE_URL="https://...supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="sb_publishable_..."
SUPABASE_SERVICE_ROLE_KEY="sb_secret_..."
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

⚠️ `.env` в `.gitignore` — секреты в Git не попадают.

## Ключевые зависимости (package.json)

- `@prisma/adapter-pg` — драйвер Prisma для PostgreSQL (обязательный).
- `@supabase/supabase-js` — клиент Supabase.
- `dexie` — IndexedDB.
- `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` — drag-n-drop (сортировка товаров).
- `zod` — валидация.
- `prisma` (dev) — CLI.

## Тема (dark mode)

- Class-based: `@custom-variant dark` в `app/globals.css`; класс `dark` на `<html>`.
- `hooks/use-theme.ts` — режимы light/dark/system, localStorage, анти-flash-скрипт в `app/layout.tsx`, обновление `meta theme-color`.
- Цвета статусов — CSS-переменные `--status-sufficient/low/out` (осветляются в `.dark`); `stock-check.tsx` использует `var(--status-*)`.

## Скрипты

- `npm run dev` / `build` / `start` / `lint`
- `npx prisma migrate dev --name <имя>` — миграции
- `npx prisma studio` — просмотр БД

## Коммиты (Gitmoji)

- Все коммиты — в стиле Gitmoji + Conventional Commits: `:emoji: Тип: описание` (пример: `:label: Переименовано приложение из AppOld в AppNew`).
- Справочник: `@references/emoji-for-commits.md` (файл в репо).
- Часто используемые: ✨ `:sparkles:` feat · 🐛 `:bug:` fix · 📝 `:memo:` docs · 🔨 `:hammer:` refactor · 🎨 `:art:` style · 🔧 `:wrench:` chore · 🏷️ `:label:` ребрендинг/имена · 🚚 `:truck:` переименование файлов · 🔖 `:bookmark:` релиз · 🚀 `:rocket:` deploy.

## Релиз: версионирование иконок и Service Worker (важно!)

### 1. Иконки приложения (`icon-192.png` / `icon-512.png`)

Менять **только** когда поставляются новые файлы иконок (новый дизайн).

Что сделать:
- Заменить `public/icons/icon-192.png` и `public/icons/icon-512.png` новыми PNG (размеры должны совпадать: 192×192 и 512×512).
- Если нужна иконка вкладки — пересоздать `app/favicon.ico` из новой иконки (команда ниже).
- **Увеличить `?v=N` на 1** в трёх местах:
  - `app/manifest.ts`: `src: "/icons/icon-192.png?v=N"` и `src: "/icons/icon-512.png?v=N"`;
  - `app/layout.tsx`: `apple-touch-icon href="/icons/icon-192.png?v=N"`.
- Пересобрать и задеплоить.

### 2. Версия кэша Service Worker (`CACHE_NAME`)

Менять **при каждом релизе, который должен обновить офлайн-кэш**: любое изменение клиентского кода (UI, логика, иконки, sw.js).

Что сделать:
- В `public/sw.js` поднять `const CACHE_NAME = "inventory-vX.Y.Z"` (например, `inventory-v2.2.0` → `inventory-v2.2.1`).
- Новый SW считается браузером «другой версией» → устанавливается, при активации удаляет старый кэш и кэширует свежие ресурсы.
- Правило: **изменился любой файл, который попадает в кэш (или сам sw.js) — версию поднимаем.**

### 3. Почему нельзя просто заменить файлы

- Браузер кэширует иконки по URL (HTTP-кэш + кэш SW). Без смены URL (через `?v=`) и без нового SW он может долго отдавать старые байты.
- Иконка установленного PWA на главном экране — **системная**, не обновляется ни SW, ни `?v=`. Надёжно — только **переустановка PWA** (удалить и добавить заново). Данные при этом не теряются: после установки приложение сделает pull с сервера.

### 4. Как проверить, что изменения подхватились

- **Сайт (вкладка браузера):** Ctrl+F5; DevTools → Application → Manifest — новые URL иконок; favicon — новая картинка.
- **PWA:** появится баннер «Доступна новая версия» (механизм D19) → «Обновить» → перезагрузка с новым кэшем. Иконка на главном экране — только переустановкой.
- После деплоя: `curl -sI https://домен/icons/icon-192.png?v=N` → 200; `curl -s https://домен/sw.js` → новый `CACHE_NAME`.

### 5. Генерация `app/favicon.ico` из PNG (Node, без зависимостей)

```js
const fs = require("fs");
const png = fs.readFileSync("public/icons/icon-192.png");
const size = 192;
const header = Buffer.alloc(6); header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4);
const entry = Buffer.alloc(16);
entry.writeUInt8(size, 0); entry.writeUInt8(size, 1); entry.writeUInt8(0, 2); entry.writeUInt8(0, 3);
entry.writeUInt16LE(1, 4); entry.writeUInt16LE(32, 6);
entry.writeUInt32LE(png.length, 8); entry.writeUInt32LE(22, 12);
fs.writeFileSync("app/favicon.ico", Buffer.concat([header, entry, png]));
```

### 6. Сводная таблица

| Сценарий | `CACHE_NAME` | `?v=` у иконок | favicon |
|---|---|---|---|
| Релиз кода/фич (иконки не менялись) | **поднять** | не трогать | не трогать |
| Новые иконки | **поднять** | **увеличить** | пересоздать |
