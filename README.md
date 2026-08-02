# ADL Pressure Map

Эвристическая карта зон повышенного риска Auto-Deleveraging (ADL) для
бессрочных контрактов Bybit. Next.js 14 (App Router) + один serverless API
route, который агрегирует публичные данные Bybit v5 и отдаёт готовую карту
фронтенду.

**Это не официальный инструмент Bybit и не персональный ADL-рейтинг.**
Реальная формула ранжирования ADL использует приватные данные конкретного
счёта (Entry Price, Margin Rate), которые недоступны через открытый API ни
для одной биржи. Карта показывает эвристическую зону риска, построенную на
объёме, funding rate, open interest и long/short ratio. Список конкретных
допущений — в разделе «Что эта карта не знает» прямо в интерфейсе
(`lib/compute.ts`, поле `assumptions`).

## Стек

- Next.js 14 / React 18 / TypeScript
- Без внешних UI-библиотек — heatmap нарисован вручную на SVG
  (`components/Heatmap.tsx`)
- Данные: `https://api.bybit.com/v5/market/*` (kline, tickers, risk-limit,
  account-ratio, insurance) — запрашиваются только на сервере
  (`app/api/adl-map/route.ts`), поэтому CORS не проблема и ответ можно
  кэшировать (`s-maxage=15`)

## Локальный запуск

```bash
npm install
npm run dev
```

Откройте http://localhost:3000

## Деплой на Vercel

### Вариант А — через веб-интерфейс (без консоли)

1. Залейте эту папку в свой GitHub-репозиторий:
   ```bash
   git init
   git add .
   git commit -m "ADL pressure map MVP"
   git branch -M main
   git remote add origin https://github.com/<ваш-юзернейм>/<репозиторий>.git
   git push -u origin main
   ```
2. Зайдите на https://vercel.com → **Add New… → Project**.
3. Выберите этот репозиторий из списка — Vercel сам определит Next.js и
   поставит правильные настройки сборки (`next build`, output — Next.js).
4. Никаких переменных окружения не требуется: Bybit API публичный, ключи не
   нужны.
5. Нажмите **Deploy**. Через 1–2 минуты получите `*.vercel.app` ссылку.

### Вариант B — через Vercel CLI

```bash
npm i -g vercel
vercel        # предпросмотр
vercel --prod # продакшн-деплой
```

## Известные ограничения (сознательно не решены в MVP)

- **Нет реального 8-часового high-water mark страхового фонда.** Bybit
  публикует только текущий баланс фонда через REST/WS, а не историю.
  Trigger Line / Stop Line видны в вебе биржи, но не отдаются публичным API.
  В интерфейсе это явно помечено, а не выдаётся за реальный триггер.
- **Volume profile — не карта открытых позиций.** Это распределение
  оборота (turnover) по свечам за выбранное окно, используется как прокси
  для «где вошли трейдеры».
- **«Leveraged Return» на карте — не формула Bybit**, а её упрощение
  (`PnL% × выбранное среднее плечо`), потому что реальный Position Margin
  Rate — приватная величина конкретного счёта.
- **Long/Short Ratio** — по числу аккаунтов (`account-ratio`), не по объёму
  открытых позиций.

## Возможные следующие шаги

- Cron-задача (Vercel Cron) раз в несколько минут, сохраняющая снапшоты
  баланса страхового фонда в KV/Postgres — тогда можно честно считать
  скользящий 8-часовой high-water mark и drawdown.
- Переход с volume profile на прямую агрегацию `allLiquidation` WebSocket
  фида для более точной оценки того, где концентрируются позиции.
- Мульти-биржевой режим (Binance использует свою публичную формулу ADL
  `PnL% × Effective Leverage` — её можно сравнивать бок о бок).
