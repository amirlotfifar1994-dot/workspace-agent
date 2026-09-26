# System Resilience Model — v0.8.3

## هدف
Agent نباید Drive Letter را معادل هویت دیسک فرض کند. `E:` می‌تواند ناپدید شود، Volume دیگری روی همان حرف ظاهر شود، یا همان Volume قبلی با `F:` برگردد. v0.8.3 یک لایه read-only برای تشخیص این وضعیت اضافه می‌کند.

## Volume probe
روی Windows:
- `Get-Volume -DriveLetter ...`
- داده‌های ثبت‌شده: `UniqueId`, `Path`, `DriveLetter`, `FileSystem`, `DriveType`, `HealthStatus`, `Size`.
- فراخوانی از `child_process.spawn` با command ثابت انجام می‌شود.
- ورودی متغیر فقط از environment (`WA_DRIVE_LETTER`, `WA_VOLUME_UNIQUE_ID`) عبور می‌کند.
- `exec`, command interpolation و arbitrary shell وجود ندارد.

اگر probe عمیق Windows در دسترس نباشد، availability فایل‌سیستم همچنان بررسی می‌شود ولی identity ضعیف (`drive:`/`root:`) **نمی‌تواند** identity قوی قبلی (`volume:`/`path:`) را با خطای کاذب جایگزین کند.

### Probe cadence
برای اینکه Agent هر چند ثانیه یک PowerShell جدا برای هر Root نسازد، دو سطح Probe داریم:
- availability سبک: پیش‌فرض هر ۵ ثانیه با File System؛
- identity عمیق: پیش‌فرض هر ۶۰ ثانیه یا در صورت نیاز؛
- identity عمیق **اجباری** در Startup، بعد از Resume و درست قبل از Write/Rollback.

اگر Root unavailable بماند و Volume قبلی در اولین lookup پیدا نشود، lookup بر پایه `UniqueId` در cadence عمیق دوباره تکرار می‌شود. بنابراین اگر همان Volume بعداً با Drive Letter دیگری برگردد، Rebind Candidate در Probe بعدی کشف می‌شود؛ همچنان Auto-Rebind انجام نمی‌شود.

## Root state machine
- `available`: Root خواندنی است و identity conflict ندارد.
- `unavailable`: Root در دسترس نیست؛ Watcher Block و Root Dirty می‌شود.
- `reconnected`: همان identity بعد از gap برگشته است؛ Watcher می‌تواند دوباره فعال شود ولی Full Reindex لازم است.
- `identity-changed`: Root path موجود است اما Volume identity با مقدار قبلی فرق دارد؛ Watcher Block می‌ماند.
- `relocated-candidate`: Volume قبلی با UniqueId یکسان روی Drive Letter دیگری پیدا شده است؛ فقط candidate نمایش داده می‌شود.

## Invariants ایمنی
1. **No Auto-Rebind**: تغییر Drive Letter هیچ Root/Config را خودکار جابه‌جا نمی‌کند.
2. **No Trust by Letter**: یکسان بودن `E:` به‌تنهایی دلیل اعتماد نیست.
3. **Identity Latch**: `identity-changed` با restart یا sleep/resume پاک نمی‌شود.
4. **Fresh Reindex Acknowledgement**: فقط Fresh Reindex کامل می‌تواند identity فعلی را acknowledge و Watcher را unblock کند.
5. **Watcher Gap = Dirty Root**: disconnect, suspend, backpressure یا reconcile failure باعث Full-Reindex warning می‌شود.
6. **Offline Scan Cannot Commit**: اگر Root وسط اسکن unavailable شود، queue حفظ و stale deletion متوقف می‌شود.
7. **Partial Directory Is Replayable**: اگر قطع اتصال باعث file I/O errors در directory جاری شود، آن directory از queue حذف نمی‌شود و بعد از reconnect دوباره اسکن می‌شود.
8. **Write Preflight Is Central**: هر Cycle فایل‌سیستمی با `risk=write` و `input.root` درست قبل از Handler، Volume/Root را با Probe تازه اعتبارسنجی می‌کند.
9. **Approval Is Not a Trust Cache**: چون بعد از Confirmation دوباره `run()` اجرا می‌شود، Preflight هویت Root بعد از تأیید کاربر نیز تکرار می‌شود؛ تغییر دیسک بین Preview و Execute باعث Block می‌شود.
10. **Rollback Is Also a Write**: Undo/Rollback قبل از دست‌کاری فایل دوباره Root identity را بررسی می‌کند؛ rollback روی Volume اشتباه اجرا نمی‌شود.

## Persistent Index schema v2
جدول جدید `root_runtime` فقط metadata داخلی Agent را نگه می‌دارد:
- availability/status
- strong identity
- volume UniqueId
- drive letter/filesystem/drive type
- last probe/last seen/unavailable since
- identity-changed latch
- rebind candidate

Migration از schema v1 به v2 additive است و فایل‌های index حذف نمی‌شوند.

## Suspend / Resume
Electron `powerMonitor`:
- `suspend` → Watcherها suspend و Rootها Dirty.
- `resume` → storage probe → blocked-root policy → Watcher resume.

Blocked Rootها در `resumeAll()` نادیده گرفته می‌شوند و تا unblock صریح فعال نمی‌شوند.

## محدودیت‌ها
- UNC/network share معمولاً Volume UniqueId محلی ندارد؛ آن‌ها identity ضعیف‌تری دارند و باید با UAT جداگانه بررسی شوند.
- USB HDD ممکن است در Windows به‌عنوان `Fixed` گزارش شود؛ policy بر `UniqueId` تکیه می‌کند، نه فقط `DriveType`.
- Rebind Candidate در v0.8.3 فقط پیشنهاد است؛ migration امن Config/Index به Root جدید هنوز Auto نیست.
- تست واقعی physical disconnect، sleep/resume و Drive Letter change فقط روی Windows واقعی معتبر است.
