# Changelog — v1.0.0-rc1 / cert-kit5 Write-Integrity Hardening

این revision همچنان Feature-Frozen است و قابلیت اصلی جدیدی به محصول اضافه نمی‌کند. تمرکز آن جلوگیری از موفقیت کاذب، overwrite ناخواسته، Resume بدون Evidence و rollback ناقص در عملیات فایل است.

## File Explorer Batch

- Same-volume Move قبل از اجرا Snapshot منبع را دوباره اعتبارسنجی می‌کند.
- Resume زمانی که Source ناپدید شده فقط Destination واقعاً متناظر با Snapshot قبلی را می‌پذیرد.
- Cross-volume Move در Resumeِ source-missing بدون Hash ثبت‌شده Fail-closed است.
- Cross-volume Resume اندازه و SHA-256 مقصد را با Evidence commit قبلی تطبیق می‌دهد.
- Copy و Move درست قبل از commit یک Destination recheck نهایی دارند تا race باعث overwrite نشود.
- Undo مربوط به Move، فایل/پوشه هدف را با Snapshot بعد از Commit تطبیق می‌دهد و هدف تغییرکرده را جابه‌جا نمی‌کند.
- Undo مربوط به Replace، وجود Backup را قبل از اولین mutation بررسی می‌کند.
- restore-replaced-copy و cross-move-back از temp swap و compensation استفاده می‌کنند تا failure مرحله دوم تا حد ممکن state قبلی را حفظ کند.

## Watcher و Configuration Truthfulness

- runtime error در watcher، root را dirty می‌کند، handle مرده را می‌بندد و از map حذف می‌کند تا Full Rescan و restart ممکن باشد.
- سقف Watch Root دیگر باعث حذف بی‌صدای Root قدیمی نمی‌شود؛ `WATCH_ROOT_LIMIT_REACHED` برمی‌گردد.
- Automation Rule و Managed Zone نیز در سقف ظرفیت دیگر config قدیمی را silently evict نمی‌کنند و خطای صریح می‌دهند.

## QA

- تست اختصاصی Write Integrity برای Resume evidence، source snapshot، Undo target integrity و backup precheck اضافه شد.
- تست اختصاصی Watcher/Configuration Resilience برای dirty-root truthfulness و no-silent-eviction اضافه شد.
- تست قدیمی MAX_WALL_TIME از wall-clock شکننده به `activeElapsedMs` قطعی تغییر کرد تا flaky نباشد.

## آنچه این revision اثبات نمی‌کند

این hardening جای Windows Certification واقعی را نمی‌گیرد. package-lock رسمی، npm ci با Runtime pin شده، Windows 10/11، دو Volume NTFS، Scale 100k/1M، NSIS/Portable، upgrade واقعی 0.9.8 و policy امضا همچنان روی Release Lane واقعی باید اجرا شوند.
