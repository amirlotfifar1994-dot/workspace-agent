# مدل هم‌زمانی و Lease در Windows Workspace Agent — v1.0.0-rc1 / cert-kit7

## هدف

cert-kit7 برای جلوگیری از برخورد چند عملیات فایل‌سیستمی روی یک مسیر، پوشه یا Volume طراحی شده است. هدف این لایه این نیست که ویندوز یا برنامه‌های دیگر را قفل کند؛ هدف این است که خود Agent دو عملیات ناسازگار را هم‌زمان روی یک محدوده اجرا نکند و در صورت رقابت، به‌صورت امن Pause شود.

## 1. Single Instance

Electron در شروع `app.requestSingleInstanceLock()` می‌گیرد. نمونه دوم برنامه بلافاصله بسته می‌شود و پنجره نمونه اصلی Focus/Restore می‌شود. در نتیجه دو Process مستقل از خود Workspace Agent نمی‌توانند هم‌زمان State/SQLite/فایل‌ها را مدیریت کنند.

این Gate جایگزین قفل‌های ویندوز یا بررسی صحت فایل نیست؛ فقط ریسک Multi-process داخلی برنامه را حذف می‌کند.

## 2. Operation Coordinator

`ExplorerOperationCoordinator` یک Lease manager درون‌پردازشی است. Leaseها عمداً Persistent نیستند. اگر Process Crash کند، Leaseها همراه Process از بین می‌روند و Startup reconciliation مسئول تشخیص Job/Cycle نیمه‌تمام و stale/dirty کردن Index/Root است. این طراحی از باقی‌ماندن قفل جعلی پس از Crash جلوگیری می‌کند.

### Path scope

- `read`: چند Reader روی مسیرهای هم‌پوشان مجازند.
- `write`: با Reader یا Writer هم‌پوشان ناسازگار است.
- مسیر Parent و Child هم‌پوشان محسوب می‌شوند.
- دو مسیر sibling که هم‌پوشانی ندارند می‌توانند هم‌زمان Write شوند.

### Volume scope

- `shared`: با shared دیگر روی همان Volume سازگار است.
- `exclusive`: با هر Lease دیگر روی همان Volume ناسازگار است.
- عملیات Cross-volume Move از Lease انحصاری Volumeها استفاده می‌کند؛ Copy می‌تواند Source را shared و Destination را exclusive بگیرد.

## 3. محدوده عملیات تحت پوشش

### File Explorer single writes

Copy، Move، Rename و New Folder قبل از اجرای Write Lease می‌گیرند. در صورت Conflict چرخه با `EXPLORER_OPERATION_BUSY` Pause می‌شود و هیچ Mutation جدیدی انجام نمی‌دهد. پس از آزادشدن Lease، Resume مجاز است.

### File Explorer batch jobs

Batch Copy/Move برای Chunk جاری Lease می‌گیرد. Lease تا پایان Mutation همان Chunk و Reconcile فوری Index نگه داشته می‌شود. در Conflict، Job به `paused-concurrency` می‌رود و Cursor جلو نمی‌رود.

### Workspace write cycles

چرخه‌های Write غیر-Explorer که `input.root` دارند نیز از `CycleEngine.stepLease` استفاده می‌کنند. این مسیر شامل عملیات‌هایی مانند Organize، Duplicate Review، Maintenance Cleanup، Bulk Rename و Recommendation Apply است. Lease فقط در مرحله Write تأییدشده گرفته می‌شود و بعد از همان Step آزاد می‌شود.

## 4. جلوگیری از اجرای موازی همان Cycle

`CycleEngine` برای هر Cycle یک Promise در `inFlight` نگه می‌دارد. دو فراخوانی هم‌زمان `run(cycleId)` همان اجرای درحال‌کار را share می‌کنند و Handler دوبار اجرا نمی‌شود. Rollback روی Cycle درحال اجرا با `CYCLE_BUSY` رد می‌شود.

## 5. File lockهای برنامه‌های دیگر

Coordinator فقط عملیات داخلی خود Agent را هماهنگ می‌کند. برنامه‌های دیگر Windows ممکن است فایل را باز، قفل یا در همان لحظه تغییر دهند. برای این وضعیت:

- `EBUSY` و `ETXTBSY` به `EXPLORER_FILE_LOCKED` و دسته recoverable `locked` نگاشت می‌شوند.
- `EPERM` به‌صورت محافظه‌کارانه `permission-or-lock` در نظر گرفته می‌شود.
- `EACCES` و `EROFS` همچنان Permission blocker هستند.
- Snapshot، size/hash verification، destination re-check و TOCTOU guardهای cert-kit5/6 همچنان لایه نهایی صحت هستند.

بنابراین Lease داخلی ادعای انحصار در سطح OS ندارد؛ فقط جلوی Collision خود Agent را می‌گیرد و تغییر خارجی باید توسط Verify/Recovery تشخیص داده شود.

## 6. Crash / Restart semantics

Leaseها Persist نمی‌شوند. پس از Crash یا Restart ویندوز:

1. نمونه جدید هیچ Lease قدیمی را معتبر فرض نمی‌کند.
2. Startup reconciliation Cycle/Batchهای interrupted را شناسایی می‌کند.
3. Rootهای مرتبط در صورت شکاف Write به stale/dirty تبدیل می‌شوند.
4. Recovery قبل از ادامه، Evidence و حقیقت فایل‌سیستم را دوباره بررسی می‌کند.

این مدل عمداً «قفل دائمی» ندارد؛ Truth از State + Evidence + filesystem verification بازسازی می‌شود.

## 7. محدودیت‌های فعلی و Gateهای باقی‌مانده

Source-level tests رفتار Coordinator را اثبات می‌کنند، اما cert-kit7 هنوز Windows-certified نیست. موارد زیر باید روی Windows واقعی بسته شوند:

- رفتار Case-insensitive و Unicode path روی NTFS واقعی؛
- برخورد با File Handleهای واقعی برنامه‌های ثالث؛
- Cross-volume Move بین دو Volume واقعی NTFS؛
- Sleep/Resume و Restart وسط چند Job؛
- Scale 100k و 1M؛
- Windows 10 و Windows 11؛
- Build نهایی NSIS/Portable و Upgrade واقعی از v0.9.8.

## نتیجه

cert-kit7 یک لایه هماهنگی داخلی برای Multi-job safety اضافه می‌کند و در Conflict به‌جای اجرای رقابتی، Pause/Resume امن را انتخاب می‌کند. این لایه مکمل Write Integrity و Long-job Recovery است، نه جایگزین آن‌ها.
