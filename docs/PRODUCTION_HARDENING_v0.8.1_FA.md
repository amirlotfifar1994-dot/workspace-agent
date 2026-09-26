# Production Hardening Model — v0.8.1

## 1. Watcher reliability
`fs.watch` منبع حقیقت قطعی نیست. v0.8.1 آن را فقط به‌عنوان incremental hint استفاده می‌کند.

Pipeline:
`fs.watch → path coalesce → bounded pending → bounded batch → serial reconcile → SQLite`

اگر event drop/failure رخ دهد، Agent به‌جای فرض همگام بودن Index، Root را Dirty می‌کند. راه خروج از Dirty state یک Full Persistent Scan موفق است.

## 2. Hash isolation
Hash فایل‌های حجیم می‌تواند Main Thread را درگیر کند. Indexed Duplicate اکنون SHA-256 را در `worker_threads` اجرا می‌کند. Cache hit همچنان بدون Worker پاسخ داده می‌شود. اگر Worker runtime قابل استفاده نباشد، سیستم fail-open خطرناک ندارد؛ فقط به hash implementation قبلی و stable fallback برمی‌گردد.

## 3. SQLite operational health
Health سطح Agent:
- `PRAGMA quick_check` پیش‌فرض.
- `integrity_check` فقط در deep check اختیاری.
- DB/WAL bytes، page count و freelist ثبت می‌شود.
- `wal_checkpoint(PASSIVE)` برای maintenance عادی.
- `PRAGMA optimize`.
- orphan hash cleanup.
- scan error retention تا 10,000 رکورد جدید.

`VACUUM` عمداً اتوماتیک نیست چون می‌تواند طولانی و blocking باشد.

## 4. Concurrency guard
- برای هر Root فقط یک Full Scan همزمان.
- Maintenance در زمان Full Scan اجرا نمی‌شود.
- Watch reconcile batchها سریال‌اند.
- Duplicate worker pool concurrency سقف 1..8 دارد.

## 5. Crash behavior
Queue پوشه‌ها در SQLite است و directory جاری تا پایان پردازش از queue حذف نمی‌شود. بنابراین kill وسط directory باعث resume idempotent می‌شود: رکوردهای همان Generation دوباره upsert می‌شوند و stale generation فقط بعد از commit نهایی حذف می‌شود.

## 6. مواردی که هنوز Production-verified نیستند
- Windows 10/11 NTFS UAT باید روی سیستم واقعی اجرا شود.
- Installer/Portable واقعی هنوز در این محیط build نشده‌اند چون `node_modules/vite` نصب نیست.
- Code Signing هنوز configured نشده است.
- `package-lock.json` باید قبل از release رسمی تولید و commit شود.
- 1M فایل واقعی NTFS با نام‌های Unicode/long-path/reparse-point هنوز UAT نشده است.
