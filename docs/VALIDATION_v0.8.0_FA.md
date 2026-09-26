# Validation v0.8.0

## Automated checks
- Main/Preload/IPC/Service syntax: PASS
- JSX/TS parser check: PASS
- تمام regression testهای v0.7.2: PASS
- Persistent Index core: PASS
- Pause/Resume persistent queue: PASS
- Generation stale-commit safety: PASS
- Indexed Search pagination: PASS
- Incremental add/delete reconcile: PASS
- Indexed Duplicate + SHA-256 cache: PASS
- Persistent Index Cycle chunk/resume: PASS

## Synthetic SQLite scale benchmark
Script: `npm run test:index-scale`

| Records | Incremental seed time* | Search | Duplicate candidate query | RSS | Heap | DB size |
|---:|---:|---:|---:|---:|---:|---:|
| 100,000 | 2.788s | 140ms | 68ms | 67MB | 7MB | 98MB |
| 500,000 | 12.304s | 387ms | 108ms | 100MB | 8MB | 493MB |
| 1,000,000 | 16.837s | 776ms | 151ms | 103MB | 8MB | 987MB |

`*` زمان Seed مصنوعی metadata داخل SQLite است، نه اسکن واقعی NTFS و نه benchmark هم‌نوع با v0.7.

Benchmark قدیمی v0.7 با آرایه in-memory روی یک میلیون رکورد حدود 682MB RAM گزارش کرده بود. مقایسه مستقیم زمان ساخت معتبر نیست، اما کاهش pressure حافظه برای query/index workload هدف اصلی v0.8 را تأیید می‌کند.

## Runtime compatibility
در محیط validation فعلی Node v22.16.0، `node:sqlite` موجود بود اما ExperimentalWarning نشان داد. Runtime هدف Electron 43 با Node 24.x است. همچنین graceful-degrade برای Runtime فاقد SQLite تست شده است. قبل از release نهایی باید Windows packaged build و `node:sqlite` در همان Electron binary UAT شود.

## Build در این محیط
- `npm run build` اجرا شد اما چون `node_modules` در محیط artifact نصب نبود، با `vite: not found` متوقف شد. این مورد خطای سورس/JSX نیست؛ syntax، JSX و regression suite همگی PASS هستند.
- `npm install` در این محیط انجام نشد؛ Windows packaged build باید روی محیط توسعه با dependencyهای نصب‌شده اجرا شود.

## مواردی که هنوز UAT واقعی لازم دارند
- 1M-file NTFS واقعی روی Windows 10/11.
- crash واقعی process در وسط scan و Resume بعد از restart.
- rename/move directory بزرگ با `fs.watch` روی NTFS.
- NSIS + Portable packaged build.
- UIA Action UAT واقعی روی Windows.
- `npm run test:windows-index-uat` روی Windows: 5,000-file restart/resume + File Watch add/delete reconcile.
- performance روی HDD در مقابل SSD/NVMe و backpressure tuning.
