# Changelog — v1.0.0-rc1 / cert-kit6 Long-Job Consistency

این revision semver را تغییر نمی‌دهد و Feature Freeze را حفظ می‌کند.

## اصلاحات اصلی

- اضافه‌شدن `commit-ready` و SHA-256 commit-intent برای بستن Crash window بین rename فایل و ثبت Commit در SQLite.
- Resume امن Copy/Replace فقط با Evidence ثبت‌شده؛ state مبهم fail-closed می‌شود.
- Rollback per-item با stateهای `rolled-back` و `rollback-failed` و Retry idempotent فقط برای شکست‌ها.
- Transaction source identity شامل type/size/mtime/dev/ino برای جلوگیری از تشخیص فایل هم‌اندازه بی‌ربط به‌عنوان Move قبلی.
- Startup reconciliation برای Cycleهای interrupted، Batchهای running و Transactionهای recoverable؛ Root درگیر stale/dirty می‌شود.
- Reconcile پوشه در صورت truncation/error دیگر `ok:true` نمی‌دهد و Full Rescan را اجباری می‌کند.
- Watcher نتیجه partial reconcile را gap ثبت می‌کند.
- File Explorer Search فقط از Persistent Index با status=`completed` استفاده می‌کند؛ در stale state fallback bounded scan دارد.
- Indexed Search / Indexed Duplicates روی Index غیرتازه با `INDEX_NOT_FRESH` متوقف می‌شوند.
- Undo/Recovery بعد از mutation، Index paths را reconcile می‌کنند.
- `toolingRevision` از cert-kit5 به cert-kit6 ارتقا یافت؛ Reportهای revision قدیمی Peer معتبر این Source نیستند.

## وضعیت Release

Source gates پاس شده‌اند؛ Windows Certification واقعی، lockfile رسمی، Scale و binary artifacts هنوز باید در Release Lane اجرا شوند.
