# Windows System UAT — v0.8.3

## 1) پایه
```powershell
npm run check
npm run test:windows-system-resilience-uat
```
انتظار:
- Volume identity ثبت شود.
- 500 فایل Unicode index شوند.
- Watcher suspend/resume شبیه‌سازی‌شده Dirty flag بسازد.
- Fresh Reindex + acknowledge Dirty/identity latch را پاک کند.

## 2) Sleep / Resume واقعی
1. یک Root را Watch و Index کن.
2. سیستم را Sleep کن.
3. Resume کن.
4. در File Watcher بررسی کن `needsFullRescan=true` شده باشد.
5. Fresh Reindex اجرا کن.
6. Dirty flag بعد از Commit باید پاک شود.

## 3) Physical removable drive
```powershell
$env:WA_REMOVABLE_ROOT='E:\Workspace'
$env:WA_REMOVABLE_PHASE='baseline'
npm run test:windows-removable-uat
```
سپس دیسک را جدا کن:
```powershell
$env:WA_REMOVABLE_PHASE='disconnected'
npm run test:windows-removable-uat
```
دوباره وصل کن، حتی اگر حرف درایو تغییر کرد:
```powershell
$env:WA_REMOVABLE_PHASE='reconnected'
npm run test:windows-removable-uat
```

## 4) Scale
```powershell
$env:WA_SCALE_FILES='100000'
npm run test:windows-scale-resilience-uat
```
سپس 500k و در سیستم مناسب 1M.

موارد ثبت‌شونده:
- file generation time
- scan time
- query time
- RSS/heap
- DB bytes
- resumes
- UI responsiveness در Electron واقعی

## 5) Identity mismatch test
روی یک حرف درایو آزمایشی:
- Volume A را baseline کن.
- A را جدا کن.
- Volume B را با همان Drive Letter وصل کن.
- Agent باید `identity-changed` نشان دهد.
- Watcher باید Block بماند.
- Sleep/Resume یا Restart نباید Block را پاک کند.
- فقط Fresh Reindex صریح روی Volume B می‌تواند identity را acknowledge کند.

## 6) Rebind candidate
- Volume A با E: baseline شود.
- جدا شود.
- همان A با F: برگردد.
- Agent فقط `candidate: F:\...` نمایش دهد.
- Config/Index خودکار به F: منتقل نشود.


## 7) Write TOCTOU guard
1. یک Cycle نوشتنی مثل Rename را تا Preview/Confirmation ببرید.
2. قبل از Approve، Volume اصلی را جدا یا با Volume دیگری جایگزین کنید.
3. Approve کنید.
4. انتظار: Handler اجرا نشود و Cycle با `ROOT_UNAVAILABLE` یا `VOLUME_IDENTITY_CHANGED` Fail-safe شود.
5. همین سناریو را برای Rollback یک Transaction آزمایشی تکرار کنید؛ Undo نباید روی Volume اشتباه اجرا شود.

## 8) Delayed drive-letter relocation
1. Volume A روی `E:` baseline شود.
2. A را جدا کنید و یک Probe بگیرید؛ Candidate هنوز نباید اجباری باشد.
3. مدتی بعد A را روی `F:` وصل کنید.
4. بدون تغییر Config، `Probe Storage` را دوباره اجرا کنید.
5. انتظار: Candidate `F:\...` پیدا شود و هیچ Auto-Rebind/Auto-Write انجام نشود.
