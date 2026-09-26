# File Explorer Production Hardening — v0.9.6

## هدف

v0.9.6 روی رفتار File Explorer در شرایطی تمرکز دارد که عملیات عادی فایل معمولاً می‌شکند: مقصد روی Volume دیگر، دیسک تقریباً پر، Read-only/ACL failure، قطع‌شدن Volume و Crash بین Commit مقصد و حذف Source.

## Cross-volume Model

### انتخاب مقصد

Root خارجی از Renderer به‌صورت path خام پذیرفته نمی‌شود. `wa:explorer-pick-destination-root` Folder Picker خود Electron را باز می‌کند و Backend یک token تصادفی کوتاه‌عمر می‌سازد. `wa:start-explorer-batch` فقط همان token را Resolve می‌کند و `destinationRoot` ارسالی Renderer را حذف می‌کند.

### Move

Same-volume:

`source → rename(destination) → verify`

Cross-volume file:

`source → stage روی destination volume → fsync → optional backup → rename stage→destination → SHA-256 source/destination → state=committed → delete source → state=done`

نکته کلیدی: `done` فقط پس از حذف موفق Source ثبت می‌شود. اگر Process بعد از Commit مقصد Crash کند، Resume با state=`committed` مقصد را Hash-verify و سپس حذف Source را کامل می‌کند.

Cross-volume directory:

- `mkdir` مقصدها
- `file-xmove` برای فایل‌ها
- `rmdir-source` به ترتیب عمق معکوس

Source directory فقط اگر واقعاً خالی باشد حذف می‌شود. Symlink/Junction و entry ویژه در Cross-volume Move Fail-closed هستند.

## Storage Guard

قبل از Preview، مقدار تقریبی داده‌ای که واقعاً Copy می‌شود محاسبه می‌شود. Same-volume Move نیاز به فضای معادل کل Source ندارد؛ Copy و Cross-volume Move دارند.

`needed = requiredBytes + reserveBytes`

reserve پیش‌فرض 256 MiB است. قبل از هر `file-copy/file-xmove` نیز فضای مقصد دوباره بررسی می‌شود.

## Recoverable blockers

این خطاها Batch را Fail نهایی نمی‌کنند:

- `ENOSPC`, `EDQUOT` → `paused-storage`
- `EACCES`, `EPERM`, `EROFS` → `paused-permission`
- disconnect / unavailable root / volume identity mismatch → `paused-root`

Item در checkpoint امن باقی می‌ماند. Stage ناقصِ قبل از Backup پاک می‌شود و Resume می‌تواند از همان Item دوباره تلاش کند.

خطاهای integrity مثل Source changed، Hash mismatch یا conflict غیرمنتظره همچنان Fail نهایی هستند.

## Root Identity

Source و Destination هر دو قبل از Preview و قبل از هر chunk توسط RootResilienceService بررسی می‌شوند. identity ثبت‌شده در Job با identity تازه مقایسه می‌شود. عوض‌شدن هارد پشت همان Drive Letter عملیات را Block می‌کند.

## Undo

Cross-volume Undo:

`destination verified → copy-back atomic به source volume → SHA-256 verify → remove destination → restore replaced destination backup (اگر وجود داشته باشد)`

Undo در صورت اشغال‌شدن Source یا تغییر محتوای Destination Fail-closed است.

## Compatibility

SQLite Job Store به schema v2 ارتقا یافت. هنگام بازشدن دیتابیس v1، ستون‌های Source/Destination root/identity، reserve و cross-volume اضافه و Rootهای قدیمی با همان `root` قبلی backfill می‌شوند.
