# Windows Release Checklist — v0.8.3

## A. محیط تمیز
- [ ] Windows 10 x64 یا Windows 11 x64 واقعی
- [ ] Node دقیقاً مطابق `.nvmrc`
- [ ] npm دقیقاً مطابق `packageManager`
- [ ] clean source tree
- [ ] هیچ `.pfx/.p12/.key/.env` داخل source tree نباشد

## B. Lockfile
- [ ] `npm run check:dependency-pins`
- [ ] `npm run release:lock`
- [ ] `package-lock.json` review و commit شده
- [ ] `npm run check:release-inputs` PASS
- [ ] Release فقط از `npm ci` استفاده کند

## C. Regression / UAT پایه
- [ ] `npm run check`
- [ ] `npm run test:system-resilience`
- [ ] `npm run test:windows-uia-uat`
- [ ] `npm run test:windows-index-uat`
- [ ] `npm run test:windows-production-uat`
- [ ] `npm run test:windows-verification-uat`
- [ ] `npm run test:windows-system-resilience-uat`

## D. Power / Volume matrix
- [ ] Sleep → Resume واقعی
- [ ] Watch Root بعد از Resume Dirty شود
- [ ] Fresh Reindex Dirty را پاک کند
- [ ] Volume A disconnect
- [ ] Volume A reconnect با همان Drive Letter
- [ ] Volume B روی Drive Letter قبلی A → `identity-changed`
- [ ] blocked root بعد از Sleep/Resume همچنان Block باشد
- [ ] Volume A با Drive Letter جدید → فقط Rebind Candidate
- [ ] Auto-Rebind رخ ندهد
- [ ] Fresh Reindex تنها مسیر acknowledge identity جدید باشد
- [ ] تغییر/قطع Volume بین Preview و Approve، Write handler را Block کند
- [ ] تغییر/قطع Volume قبل از Rollback، Undo handler را Block کند
- [ ] Root unavailable که در Probe اول پیدا نشد، بعداً با همان UniqueId و Drive Letter جدید به‌صورت Candidate کشف شود

## E. Removable UAT
سه فاز:
```powershell
$env:WA_REMOVABLE_ROOT='E:\Workspace'
$env:WA_REMOVABLE_PHASE='baseline'
npm run test:windows-removable-uat

$env:WA_REMOVABLE_PHASE='disconnected'
npm run test:windows-removable-uat

$env:WA_REMOVABLE_PHASE='reconnected'
npm run test:windows-removable-uat
```
- [ ] هر سه فاز PASS
- [ ] UniqueId ثابت بماند
- [ ] Drive Letter change در report ثبت شود

## F. NTFS / filesystem matrix
- [ ] filename فارسی
- [ ] emoji
- [ ] >260 character path
- [ ] UNC share در صورت وجود محیط تست
- [ ] junction/symlink خارج Root traverse نشود
- [ ] HDD
- [ ] SSD
- [ ] removable media

## G. Scale
```powershell
$env:WA_SCALE_FILES='100000'
npm run test:windows-scale-resilience-uat
```
سپس:
- [ ] 100k PASS
- [ ] 500k PASS
- [ ] 1M PASS روی سیستم مناسب
- [ ] RSS/Heap ثبت شود
- [ ] query latency ثبت شود
- [ ] UI responsiveness دستی تأیید شود

## H. Package verification
- [ ] Vite build
- [ ] `win-unpacked`
- [ ] `app.asar.unpacked/electron/services/hash-worker.cjs`
- [ ] `windows-path-utils.cjs` کنار Worker
- [ ] packaged Worker smoke PASS
- [ ] NSIS
- [ ] Portable
- [ ] نام artifactها collision نداشته باشد

## I. Signing
Certificate/Private Key فقط از CI/secret environment:
- `CSC_LINK` یا `WIN_CSC_LINK`

```powershell
powershell -ExecutionPolicy Bypass -File scripts/windows-release.ps1 -RequireSigning
```

- [ ] همه artifactها `Get-AuthenticodeSignature => Valid`
- [ ] signer subject/thumbprint در manifest
- [ ] certificate/private key داخل source ZIP نیست
- [ ] Defender scan
- [ ] SmartScreen behavior ثبت شده

## J. Artifact integrity
- [ ] `SHA256SUMS.txt`
- [ ] `release-manifest.json`
- [ ] package-lock SHA-256
- [ ] NSIS + Portable در manifest
- [ ] system-resilience UAT در manifest
- [ ] hashها کنار artifact نهایی نگه‌داری شوند

## افزوده‌های v0.8.4
- [ ] `npm run certify:windows` گزارش JSON/Markdown بدهد.
- [ ] `WA_CERT_ROOT_A/B` در صورت ادعای multi-volume واقعی روی دو Volume مجزا تنظیم شود.
- [ ] `win-unpacked` packaged-worker smoke PASS.
- [ ] `win-unpacked` packaged-app bootstrap smoke PASS.
- [ ] actual hard power-loss فقط به‌عنوان شواهد دستی ثبت شود؛ Harness آن را خودکار trigger نکند.
