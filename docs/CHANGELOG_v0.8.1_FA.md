# Changelog v0.8.1

## File Watcher / Backpressure
- event key از `watchId + eventType + path` به `watchId + path` تغییر کرد تا burstهای یک Path coalesce شوند.
- `maxPending`, `maxBatchSize`, `maxDeliveryBatches` اضافه شد.
- delivery به Persistent Index سریال شد؛ batchهای reconcile دیگر overlap نمی‌کنند.
- metricهای received/coalesced/drop/delivered/failure اضافه شد.
- `dirty-roots.json` برای gap detection اضافه شد. Backpressure drop، reconcile failure یا shutdown با event تحویل‌نشده Root را Dirty می‌کند.
- Full Persistent Scan موفق از IPC، Dirty flag همان Root را پاک می‌کند.

## Duplicate Hash Worker
- `hash-worker.cjs` و `hash-worker-pool.cjs` اضافه شد.
- Indexed Duplicate SHA-256 در Worker Thread اجرا می‌شود.
- stable stat قبل/بعد Hash حفظ شده است.
- Worker failure دارای fallback امن به `hashFileStable` قبلی است.
- worker file برای packaged Electron از `app.asar.unpacked` resolve می‌شود.

## Persistent Index Health
- overlapping full scan روی Root با `INDEX_SCAN_ALREADY_RUNNING` Block می‌شود.
- maintenance هنگام active scan با `INDEX_MAINTENANCE_BUSY` Block می‌شود.
- `health()` شامل SQLite check، DB/WAL size، page/freelist و active scan است.
- `maintain()` شامل orphan hash cleanup، bounded error retention، `PRAGMA optimize` و `wal_checkpoint(PASSIVE)` است.
- `VACUUM` خودکار عمداً غیرفعال است.
- cycle/skill جدید `persistent-index-maintenance` / `skill.index.maintenance` اضافه شد.

## UI / IPC
- `wa:index-health` و `wa:watch-status` اضافه شد.
- Persistent Index UI اکنون Health + Maintenance و DB/WAL status دارد.
- File Watcher UI اکنون Pending/Coalesced/Backpressure/Reconciled و Dirty-root warning دارد.

## Release / UAT
- crash-kill integration test با child process + SIGKILL اضافه شد.
- event-storm/backpressure test اضافه شد.
- Windows production UAT اضافه شد.
- `scripts/windows-release.ps1` برای check/UAT/build/hash manifest اضافه شد.
- package version به 0.8.1 و `asarUnpack` Worker اضافه شد.
