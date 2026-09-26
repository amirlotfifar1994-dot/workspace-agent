# Exact Transactional State Restore — v1.0.0-rc1 / cert-kit13

## مشکل قبلی
Backup سالم بود، اما Restore قدیمی از مسیر import افزایشی/skip-based استفاده می‌کرد. بنابراین حذف Ruleهای جدیدتر، بازگشت exact به Backup و rollback کامل در failure میانه کار تضمین نمی‌شد.

## semantics جدید
State backup schema به `workspace-agent-state-backup-v2` ارتقا یافته و Restore مسیر مستقل `exact-transactional-v1` دارد:
1. Backup و SHA-256 payload/bundle validate می‌شوند.
2. تمام target domainها قبل از mutation normalize/validate می‌شوند.
3. state فعلی به‌عنوان previous snapshot گرفته می‌شود.
4. در حالت عادی یک pre-restore backup durable ساخته می‌شود.
5. `restore-intent.json` قبل از اولین mutation به‌صورت atomic+fsync نوشته می‌شود.
6. Automation Rules، Managed Zones و Watch Roots با exact replacement جایگزین می‌شوند.
7. Local AI settings با exact replacement برمی‌گردند.
8. Rootهای متاثر در Index/Watcher stale/dirty می‌شوند تا نتیجه قدیمی به‌عنوان truth استفاده نشود؛ Full Rescan لازم اعلام می‌شود.
9. فقط پس از تکمیل تمام مراحل restore-intent حذف می‌شود.

## failure و crash
اگر هر مرحله fail شود، previous state به‌صورت خودکار بازگردانی می‌شود. اگر process/Windows وسط Restore متوقف شود، constructor در startup restore-intent را می‌بیند و قبل از ادامه Runtime، previous state را recover می‌کند. اگر recovery خودش fail شود Runtime fail-closed می‌شود و intent برای بررسی باقی می‌ماند.

## Exactness scope
Exactness مربوط به domainهایی است که در Backup v2 قرار دارند:
- Automation Rules
- Managed Zones سفارشی
- Watch Roots
- Local AI settings

Workspace files، Event Journal، Cycle/Transaction databases، Persistent Index DB و Secretها عمداً داخل Backup نیستند. Index metadata فقط برای تعیین Rootهای نیازمند rebuild استفاده می‌شود؛ بنابراین این قابلیت **full disaster-recovery image** نیست.

## Compatibility
Backup schema v1 همچنان قابل خواندن است، ولی Restore آن از semantics جدید exact استفاده می‌کند. Config import عادی همچنان additive باقی مانده و از State Restore جداست.

## Regression
`tests/state-restore-transactional-rc1.test.cjs` exact replacement، failure rollback، startup crash recovery و index freshness invalidation را پوشش می‌دهد.
