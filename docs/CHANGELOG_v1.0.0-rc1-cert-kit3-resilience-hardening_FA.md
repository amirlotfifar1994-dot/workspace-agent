# Changelog — v1.0.0-rc1 / cert-kit3 Production Resilience Hardening

تاریخ: 2026-08-15

این revision تحت Feature Freeze انجام شده است. هدف افزودن capability اصلی جدید نیست؛ هدف بستن خطاهای correctness، rollback/recovery و usability در عملیات فایل طولانی قبل از Windows Certification است.

## اصلاحات Cycle Engine

- active runtime از wall-clock واقعی جدا شد؛ زمان انتظار در `waiting-confirmation`، `paused` و فاصله بین Resumeها دیگر بودجه `maxWallTimeMs` را نمی‌سوزاند.
- checkpoint زمان فعال در restart به‌صورت محافظه‌کارانه reconcile می‌شود و downtime برنامه به active runtime اضافه نمی‌شود.
- `rollback-failed` به‌عنوان وضعیت صریح Cycle ثبت می‌شود؛ rollback ناقص دیگر با `failed` عمومی مخلوط نمی‌شود و پس از رفع conflict امکان Retry وجود دارد.

## اصلاحات Retention

- `CycleStore.prune()` چرخه‌های `created/running/waiting-confirmation/paused/interrupted` را حذف نمی‌کند.
- `TransactionStore.prune()` فقط transactionهای terminal (`completed/rolled-back/abandoned`) را retention-prune می‌کند؛ transaction قابل Recovery حفظ می‌شود.

## Exact Undo / Rollback Truthfulness

- Rename Undo قبل از هر جابه‌جایی، اشغال‌بودن مقصد اصلی را بررسی می‌کند؛ در conflict فایل به temp پنهان منتقل و stranded نمی‌شود.
- Organize، Quarantine و Maintenance دیگر در conflict با نام جایگزین مانند `(2)` «موفق» گزارش نمی‌شوند؛ exact restore یا failure صریح.
- Recommendation batch، Explorer copy/move و سایر auto-rollbackها فقط وقتی `rolled-back` ثبت می‌شوند که cleanup واقعاً کامل باشد؛ در غیر این صورت `rollback-failed` و evidence مربوط ثبت می‌شود.

## Copy Recovery Safety

- Recovery مسیر Copy برای resume/rollback با SHA-256 واقعی منبع، stage و destination bind شد.
- مقصد هم‌اندازه ولی با محتوای متفاوت دیگر به‌عنوان copy معتبر تلقی نمی‌شود.
- در `RECOVERY_COPY_CONTENT_MISMATCH` مقصد دست‌نخورده می‌ماند و transaction به `recovery-failed` می‌رود.

## Advanced Batch UX

- backend checkpoint semantics حفظ شده تا عملیات قابل Resume و crash-safe بماند.
- UI پس از تأیید کاربر checkpointهای عادی را خودکار pump می‌کند؛ برای Batch بزرگ دیگر به Resume دستی پس از هر chunk نیاز نیست.
- Pause و Cancel به‌صورت serialized و در مرز امن chunk درخواست می‌شوند؛ blockerهای واقعی storage/root/permission همچنان auto-resume نمی‌شوند.
- progress پس از هر chunk در UI به‌روزرسانی می‌شود.

## Version Consistency

- برچسب اصلی UI و File Explorer از `v0.9.4/v0.9.6` به `v1.0.0-rc1` اصلاح شد.
- `workspaceAgentRelease.toolingRevision` از `cert-kit2` به `cert-kit3` ارتقا یافت تا Reportهای Certification به fingerprint صحیح این source bind شوند.

## Regression Evidence

- Source tests: `61/61 PASS`
- Recursive JS syntax: `185 files PASS`
- JSX parse/type syntax gate: PASS
- Source hygiene: PASS
- Dependency pin gate: PASS
- RC1 source contract: PASS

Windows 10/11 certification، package-lock رسمی، `npm ci` رسمی، NTFS dual-volume، scale 100k/1M، NSIS/Portable و upgrade واقعی از v0.9.8 همچنان PENDING هستند و در این محیط PASS اعلام نشده‌اند.
