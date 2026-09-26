# Validation v0.8.3

تاریخ: 2026-08-13

## محیط فعلی
- Platform: Linux container (non-Windows)
- Node: v22.16.0
- npm: 10.9.2
- Release lane پروژه: Node 24.14.1 / npm 11.11.0

این محیط Release runtime نیست؛ Windows-specific نتایج با UAT جدا و `SKIP (Windows only)` نگه‌داری می‌شوند.

## PASS در محیط فعلی
- exact dependency pins
- source hygiene
- syntax
- JSX parse gate
- تمام regressionهای قبلی
- Volume probe unit test
- schema v1 → v2 migration
- disconnect → watcher block
- same-volume reconnect
- same-letter/different-volume identity latch
- blocked root survives suspend/resume
- Fresh Reindex acknowledgement policy
- relocated-volume candidate بدون auto-rebind
- delayed relocated-volume discovery: lookup اول پیدا نکرد، Probe بعدی پس از deep interval همان `UniqueId` را روی Drive Letter جدید پیدا کرد
- availability/deep-identity cadence: Probe سبک تکرار شد ولی identity عمیق فقط در cadence/forced preflight اجرا شد
- central write-cycle guard: تغییر Volume بعد از Preview و قبل از Approval، Handler را قبل از Execute Block کرد
- rollback root guard: تغییر Volume قبل از Undo، rollback handler را Block کرد
- simulated power suspend/resume controller
- Root unavailable بین scan sessions: queue preserved
- Root unavailable وسط directory scan: queue preserved و 200/200 فایل بعد از resume
- Root unavailable در commit boundary: stale deletion deferred
- runtime identity-change guard: scan pause بدون queue consumption
- crash-kill/restart قدیمی: PASS
- watcher event-storm/backpressure قدیمی: PASS

## باگ کشف‌شده در این مرحله
در تست disconnect وسط directory، نسخه اولیه v0.8.3 بعد از Resume فقط `175/200` فایل داشت. علت: Root outage در سطح file `stat` رخ داده بود ولی directory stream error نداده بود و queue item مصرف می‌شد. Guard به `dirErrors + root availability` گسترش یافت و تست بعدی `200/200` PASS شد.

## Windows-only Pending
- actual `Get-Volume` روی Windows 10
- actual `Get-Volume` روی Windows 11
- physical removable disconnect/reconnect
- same USB volume با Drive Letter جدید
- sleep/resume واقعی
- 100k / 500k / 1M NTFS files
- packaged worker در win-unpacked
- NSIS / Portable
- Authenticode / Defender / SmartScreen

## Release eligibility
هنوز `false` است چون package-lock واقعی و Windows matrix/binary verification انجام نشده‌اند.


## Final source gate
در پایان تغییرات v0.8.3:
- `npm run check`: **PASS**
- 22 regression/integration test files: **PASS**
- Windows UIA / Index / Production / v0.8.2 Verification / System Resilience / Scale / Removable UAT: `SKIP (Windows only)` در محیط فعلی
- `npm run check:release-inputs`: **Fail-closed مطابق انتظار** با `LOCKFILE_REQUIRED` چون lockfile واقعی هنوز روی محیط آنلاین Release ساخته نشده است.
- `npm run build`: در container فعلی با `vite: not found` متوقف شد چون `node_modules` نصب نیست؛ این نتیجه به‌عنوان Build PASS ثبت نشده است.

## نتیجه Source Readiness
Source-level hardening این فاز PASS است، اما Windows physical/system certification و binary release همچنان Pending هستند.
