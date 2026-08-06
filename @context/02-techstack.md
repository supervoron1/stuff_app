# Технологический стек и схема данных

## Стек

| Технология | Версия | Назначение |
|---|---|---|
| Next.js | 16.3.0 | App Router, SSR, Server Actions, API routes |
| React | 19.2.8 | UI |
| TypeScript | 5.9.3 | Типизация (strict) |
| Tailwind CSS | 4 | Стили |
| Prisma | 7.9.1 | ORM (новый генератор `prisma-client`, driver adapter `@prisma/adapter-pg`) |
| PostgreSQL | — | Neon (бесплатный хостинг, IPv4) |
| Supabase JS | — | Storage (фото товаров), bucket `products`, public |
| Dexie | — | IndexedDB: локальный кэш + очередь outbox |
| Zod | — | Валидация форм (Server Actions / API) |

## Особенности Prisma 7 (важно!)
- Используется **новый генератор**: `generator client { provider = "prisma-client" output = "../generated/prisma" }`
  → Prisma Client импортируется из `generated/prisma/client`, а не `@prisma/client`.
- **Нет `url` в `schema.prisma`**: подключение задаётся в `prisma.config.ts` через `datasource.url = env("DATABASE_URL")`.
- **Driver adapter обязателен**: в `lib/prisma.ts` используем `new PrismaPg({ connectionString: process.env.DATABASE_URL! })` + `new PrismaClient({ adapter })`.
- Клиент **кешируется в глобальный синглтон** (паттерн для dev/HMR).

## Схема БД (`prisma/schema.prisma`)

```prisma
enum StockStatus { SUFFICIENT LOW OUT }

model Category {
  id        String    @id @default(uuid())
  name      String
  sortOrder Int       @default(0)
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  products  Product[]
}

model Product {
  id          String      @id @default(uuid())
  categoryId  String
  name        String
  description String?
  photoUrl    String?
  stockStatus StockStatus @default(SUFFICIENT)
  updatedAt   DateTime    @updatedAt   // ← для last-write-wins
  updatedBy   String?
  createdAt   DateTime    @default(now())
  category    Category    @relation(fields: [categoryId], references: [id], onDelete: Cascade)
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
- `zod` — валидация.
- `prisma` (dev) — CLI.

## Скрипты

- `npm run dev` / `build` / `start` / `lint`
- `node scripts/generate-icons.mjs` — генерация PWA-иконок
- `npx prisma migrate dev --name <имя>` — миграции
- `npx prisma studio` — просмотр БД