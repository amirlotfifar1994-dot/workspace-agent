# Changelog — v1.0.0-rc1 / cert-kit7 Concurrency Leasing

این revision Feature Freeze را حفظ می‌کند و قابلیت محصولی جدید اضافه نمی‌کند؛ هدف، بستن raceهای multi-job و هم‌زمانی Write است.

## تغییرات اصلی

- Single-instance Electron lock برای جلوگیری از اجرای هم‌زمان دو Process اصلی.
- in-flight deduplication در `CycleEngine` برای جلوگیری از اجرای موازی یک Cycle یکسان.
- جلوگیری از Rollback هنگام اجرای فعال Cycle با `CYCLE_BUSY`.
- سرویس جدید `ExplorerOperationCoordinator` با read/write Path lease و shared/exclusive Volume lease.
- Lease روی Batch Copy/Move و Cross-volume operations؛ contention به Pause/Resume امن تبدیل می‌شود.
- Lease روی Explorer Copy/Move/Rename/New Folder و Undoهای آن‌ها.
- Workspace-root step lease برای Write cycleهای غیر Explorer: Organize، Duplicate Review، Maintenance Cleanup، Bulk Rename و Recommendation Apply.
- دسته‌بندی `EBUSY` و `ETXTBSY` به‌عنوان File Lock recoverable و `EPERM` به‌صورت permission-or-lock.
- Telemetry وضعیت concurrency در runtime certification/smoke report.
- چهار Regression suite جدید برای Cycle concurrency، lease semantics، Batch/Single-write contention و file-lock classification.
- `toolingRevision` از `cert-kit6` به `cert-kit7` ارتقا یافت؛ Report revision قدیمی Peer معتبر این Source نیست.

## Validation Source-side

- Source tests: `72/72 PASS`
- JS/CJS/MJS syntax: `200 files PASS`
- JSX gate: `PASS`
- Source hygiene: `PASS`
- Dependency pins: `PASS`
- RC1 source contract: `PASS`
- Release input gate: `LOCKFILE_REQUIRED` تا زمان تولید package-lock رسمی روی Windows lane.
