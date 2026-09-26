# Changelog v0.8.3

## Added
- `windows-volume-probe.cjs`
- `root-resilience-service.cjs`
- `system-resilience-controller.cjs`
- Volume identity/runtime state در Persistent Index schema v2
- Root blocked registry در File Watcher
- IPC: `resilience-status`, `resilience-probe`
- UI نمایش storage resilience و Rebind Candidate
- Windows system-resilience UAT
- 10k–1M Windows scale UAT
- سه‌مرحله‌ای removable-drive UAT

## Changed
- Persistent Index schema: v1 → v2 با migration افزایشی.
- Full Scan قبل از stale-generation commit availability و identity guard را بررسی می‌کند.
- Watcher suspend/resume حالا blocked roots را حفظ می‌کند.
- Startup ابتدا Volume/Root state را probe می‌کند و سپس Watcherها را start می‌کند.
- Release gate به Windows system-resilience UAT مجهز شد؛ Scale UAT با `-RunScaleUat` اختیاری است.
- Root probing به availability سبک + deep identity دوره‌ای تفکیک شد؛ Startup/Resume/Write همچنان forced deep probe دارند.
- Cycle Engine برای تمام Skillهای فایل‌سیستمی `risk=write` یک root-identity preflight مرکزی دارد؛ Confirmation و Rollback نیز دوباره probe می‌شوند.

## Fixed
- Root outage وسط scan دیگر queue را مصرف و generation ناقص را commit نمی‌کند.
- file I/O errorهای ناشی از disconnect وسط directory، همان directory را از resume queue حذف نمی‌کنند.
- Volume identity weak fallback نمی‌تواند identity قوی قبلی را به‌اشتباه `changed` اعلام کند.
- `resumeAll()` دیگر blocked root را دوباره فعال نمی‌کند.
- Root unavailable که در lookup اول پیدا نمی‌شود، در deep cadence دوباره با `UniqueId` جست‌وجو می‌شود تا relocation دیرهنگام هم فقط به‌صورت Candidate کشف شود.

## Safety policy
- no auto rebind
- no automatic destructive action
- no shell interpolation
- Fresh Reindex برای acknowledge identity change الزامی است
