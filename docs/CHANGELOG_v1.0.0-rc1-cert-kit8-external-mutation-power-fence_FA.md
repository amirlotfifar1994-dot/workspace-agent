# Changelog — v1.0.0-rc1 / cert-kit8 External Mutation + Power Transition Fence

این revision Feature Freeze را حفظ می‌کند. هدف، سخت‌کردن مرز Commit در برابر تغییر فایل توسط برنامه‌های دیگر و Suspend/Resume ویندوز است؛ قابلیت محصولی جدید به Core اضافه نشده است.

## تغییرات اصلی

- `ExplorerOperationCoordinator` از schema v1 به v2 ارتقا یافت و اکنون `epoch` و system write barrier دارد.
- Suspend، ورود Write جدید را با `EXPLORER_SYSTEM_TRANSITION` Block می‌کند؛ Resume تا پایان Root/Volume probe barrier را نگه می‌دارد.
- Leaseهای گرفته‌شده قبل از Suspend پس از Resume برای Commit معتبر نیستند و با `EXPLORER_OPERATION_FENCE_STALE` Pause می‌شوند.
- Explorer Copy قبل از Commit SHA-256 منبع و Stage را تطبیق می‌دهد؛ Verify مقصد بعد از Commit نیز به Hash همان Stage bind است.
- اگر مقصد Copy بعد از Commit توسط برنامه دیگری تغییر کند، cleanup آن را حذف نمی‌کند و `destinationPreserved`/rollback-incomplete صریح ثبت می‌شود.
- هویت Parent مقصد و زنجیره symlink/junction قبل از mutation/commit دوباره اعتبارسنجی می‌شود.
- Move/Rename قبل از Commit Snapshot منبع را دوباره بررسی می‌کند و Verify تغییر هم‌زمان مقصد را با `DESTINATION_MUTATED_AROUND_MOVE` آشکار می‌کند.
- Case-only rename ویندوز با two-hop staging و transaction recovery پشتیبانی می‌شود.
- Batch Copy/Move نیز در مرزهای Commit و قبل از حذف Source در Cross-volume Move از power fence استفاده می‌کند.
- سه Regression suite جدید برای power transition fence، Batch fence و external-mutation/reparse/case semantics اضافه شد.
- `toolingRevision` از `cert-kit7` به `cert-kit8` ارتقا یافت؛ Reportهای revision قبلی Peer معتبر این Source نیستند.

## Validation Source-side

- Source tests: `75/75 PASS`
- JS/CJS/MJS syntax: `203 files PASS`
- JSX gate: `PASS`
- Source hygiene: `PASS`
- Dependency pins: `PASS`
- RC1 source contract: `PASS`
- RC1 cert-kit source tests: `PASS`
- Release input gate: `LOCKFILE_REQUIRED` تا زمان تولید package-lock رسمی روی Windows lane.
