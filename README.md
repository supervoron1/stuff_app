# Запасы

Мобильное PWA-приложение на Next.js 16 для учёта запасов по категориям. Используется с телефонов/планшетов, синхронизируется между устройствами и работает офлайн.

## Возможности

- **Категории и товары (CRUD)** — создание/редактирование/удаление; название обязательно, описание и фото — опционально
- **Наличие товара** — 🟢 есть / 🟡 мало / 🔴 нет / 🔴 «!» критично; тап по цветному индикатору циклично меняет статус (CRITICAL — красный «!» вместо галочки)
- **Порядок товаров и категорий** — перетаскивание (drag-n-drop): товары за ручку ⠿ внутри категории, категории за заголовок; порядок сохраняется и синхронизируется между устройствами
- **Мобильный UI** — фильтры по статусу (все/есть/мало/нет/критично), поиск по названию, крупные тач-элементы
- **Мультиустройственность** — единая база данных, синхронизация каждые 10 секунд + ручная кнопка ⟳
- **Офлайн-режим** — данные кэшируются в IndexedDB, изменения офлайн сохраняются в очередь и отправляются при появлении сети (outbox pattern)
- **Разрешение конфликтов** — last-write-wins: при одновременном изменении с разных устройств побеждает более поздняя запись (по `updatedAt`)
- **История изменений (аудит)** — кто, что и когда менял; имя пользователя запрашивается при первом входе
- **Фото товаров** — загрузка на Supabase Storage (только онлайн), отображение в списке
- **PWA** — установка на главный экран, полноэкранный режим, офлайн-открытие
- **Кнопка «наверх»** — плавающая кнопка внизу справа при прокрутке списка
- **Тёмная и светлая тема** — переключатель ☀️/🌙/🖥 в шапке (светлая/тёмная/системная), выбор хранится на устройстве
- **Обновление PWA** — проверка новой версии при запуске и каждые 60 сек; баннер «Доступна новая версия» с кнопкой «Обновить» (без потери данных)
- **Живое обновление** — открытые устройства автоматически подтягивают изменения других устройств

## Технологии

- **Next.js 16** (App Router), **React 19**, **TypeScript**, **Tailwind CSS 4**
- **Prisma 7** + **PostgreSQL (Neon)** — основная база данных (бесплатная, работает по IPv4)
- **Supabase Storage** — хранение фото товаров
- **Dexie (IndexedDB)** — офлайн-кэш и очередь синхронизации
- **Vercel** — хостинг (рекомендуется)

## Структура проекта

```
app/
  api/
    sync/    — синхронизация: GET (полный снимок/pull), POST (приём офлайн-операций/push)
    audit/   — история изменений
    upload/  — загрузка фото в Supabase Storage
  page.tsx   — главная страница (SSR + клиентское приложение)
  layout.tsx — корневой layout (мобильный viewport, шрифты)
  manifest.ts— PWA-манифест
  globals.css
components/
  inventory.tsx        — главный компонент (списки, фильтры, модалки)
  modal.tsx            — мобильная модалка (bottom sheet)
  forms.tsx            — формы категории/товара (с загрузкой фото)
  stock-check.tsx      — цветная галочка ✓ наличия (тап = смена статуса, см. D14)
  stock-indicator.tsx  — старый индикатор-«пилюля» (не используется, оставлен по просьбе дизайнера)
  history.tsx          — окно истории изменений
  pwa-register.tsx     — регистрация Service Worker
  scroll-to-top.tsx    — плавающая кнопка «наверх»
hooks/
  use-inventory.ts     — офлайн-first хук: кэш IndexedDB + периодическая синхронизация
  use-theme.ts         — тема: light/dark/system (localStorage, анти-flash)
  use-user.ts          — имя пользователя (localStorage)
lib/
  prisma.ts            — Prisma Client (driver adapter @prisma/adapter-pg)
  supabase.ts          — серверный клиент Supabase (для фото)
  db.ts                — локальная БД Dexie (категории, товары, outbox)
  sync.ts              — push/pull синхронизация
  actions.ts           — Server Actions (CRUD, смена статуса, аудит)
  data.ts              — чтение данных с сервера
  constants.ts         — статусы, цвета, интервалы
  types.ts             — общие типы
prisma/
  schema.prisma        — схема БД (Category, Product, AuditLog)
  migrations/          — применённые миграции
prisma.config.ts       — конфигурация Prisma CLI
public/
  sw.js                — Service Worker (кэширование app shell и API)
  icons/               — иконки PWA (icon-192.png, icon-512.png)
```

## Схема базы данных

- **Category**: `id (uuid)`, `name`, `sortOrder`, `createdAt`, `updatedAt`
- **Product**: `id (uuid)`, `categoryId → Category`, `name`, `description?`, `photoUrl?`, `stockStatus` (`SUFFICIENT | LOW | OUT | CRITICAL`), `sortOrder` (ручной порядок в категории), `updatedAt` (используется для last-write-wins), `updatedBy`, `createdAt`
- **AuditLog**: `id`, `action`, `entity`, `entityId`, `oldValue?`, `newValue?`, `userName`, `createdAt`

## Локальная настройка

### 1. Создайте базу данных (Neon)

1. Зарегистрируйтесь на [neon.tech](https://neon.tech) (можно через GitHub/Google).
2. Создайте проект (регион любой, например EU Central).
3. Скопируйте **Connection string** вида:
   ```
   postgresql://neondb_owner:ПАРОЛЬ@ep-xxxx.eu-central-1.aws.neon.tech/neondb?sslmode=require
   ```

### 2. Создайте проект Supabase (для фото)

1. Создайте проект на [supabase.com](https://supabase.com).
2. Из **Settings → API** скопируйте:
   - Project URL (например `https://xxxx.supabase.co`)
   - anon public key (`sb_publishable_...`)
   - service_role secret key (`sb_secret_...`)
3. Bucket `products` в Storage создастся автоматически при первой загрузке фото.

### 3. Настройте переменные окружения

Заполните `.env` (уже закоммичен в `.gitignore`):

```env
# База данных (Neon)
DATABASE_URL="postgresql://neondb_owner:ПАРОЛЬ@ep-xxxx.eu-central-1.aws.neon.tech/neondb?sslmode=require"

# Supabase (только для фото)
NEXT_PUBLIC_SUPABASE_URL="https://xxxx.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="sb_publishable_..."
SUPABASE_SERVICE_ROLE_KEY="sb_secret_..."

# Домен приложения (для Service Worker)
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

### 4. Примените миграцию и запустите

```bash
npm install
npx prisma migrate dev          # создаст таблицы в Neon
npm run dev                     # http://localhost:3000
```

## Деплой на Vercel

1. Загрузите код на **GitHub** (`.env` не попадёт — он в `.gitignore`).
2. В [Vercel](https://vercel.com): **Add New Project** → импортируйте репозиторий.
3. В настройках проекта (**Settings → Environment Variables**) добавьте те же переменные, что в `.env`:
   - `DATABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - `NEXT_PUBLIC_APP_URL` = адрес вашего деплоя (например `https://мой-проект.vercel.app`)
4. **Deploy** → получите https-адрес, доступный с любого устройства.

> **Миграции применяются автоматически**: в `package.json` настроен скрипт `vercel-build`
> (`prisma generate && prisma migrate deploy && next build`) — при каждом деплое Vercel сам
> применяет новые миграции к БД перед сборкой. Вручную применять не нужно.
> `prisma generate` также выполняется в `postinstall` (нужен для сборки клиента Prisma).

> Для работы офлайн и установки PWA сайт должен открываться по **https** (на Vercel это включено по умолчанию).

## Установка PWA на телефон

### Android (Chrome)
1. Откройте адрес приложения в Chrome.
2. Меню **⋮** → **«Добавить на главный экран»** / **«Установить приложение»**.
3. Иконка появится на рабочем столе — приложение откроется в полноэкранном режиме.

### iPhone / iPad (Safari)
1. Откройте адрес в **Safari**.
2. Кнопка **«Поделиться»** (квадрат со стрелкой) → **«На экран "Домой"»**.
3. **«Добавить»** → иконка появится на домашнем экране.

После установки приложение работает офлайн: данные кэшируются, изменения копятся в очереди и синхронизируются при появлении сети.

## Полезные команды

```bash
npm run dev          # dev-сервер
npm run build        # продакшен-сборка
npm run start        # запуск production
npx prisma studio    # просмотр базы данных (UI)
npx prisma migrate dev --name название  # новая миграция