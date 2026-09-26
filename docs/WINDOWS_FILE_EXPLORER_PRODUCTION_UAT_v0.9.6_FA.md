# Windows File Explorer Production UAT — v0.9.6

این UAT برای Windows 10/11 و NTFS طراحی شده است. هیچ Volume را Mount/Unmount/Format نمی‌کند و دیسک را عمداً پر نمی‌کند.

## UAT خودکار دو Root

در PowerShell دو پوشه آزمایشی روی دو درایو تعیین کنید:

```powershell
$env:WA_V096_SOURCE_ROOT='C:\WA-UAT'
$env:WA_V096_DEST_ROOT='D:\WA-UAT'
npm run test:windows-explorer-v096-uat
```

Harness فقط زیرپوشه تصادفی `.wa-v096-*`/`wa-v096-*` خودش را ایجاد و در پایان پاک می‌کند. اگر Rootها روی دو Drive مختلف باشند، Cross-volume Move باید با Copy → SHA-256 Verify → Source Delete اجرا شود و Undo نیز فایل را به Volume منبع بازگرداند.

## مواردی که باید دستی Evidence شوند

- جداکردن USB/External disk بین دو checkpoint و تأیید `paused-root`، سپس اتصال همان Volume و Resume.
- جایگزینی دیسک دیگری با همان Drive Letter و تأیید `EXPLORER_BATCH_ROOT_IDENTITY_CHANGED`.
- کم‌کردن فضای مقصد تا کمتر از `required + reserve` و تأیید `paused-storage` بدون Fail قطعی.
- Read-only کردن مقصد/ACL denial و تأیید `paused-permission`.
- Sleep/Resume حین Batch و تأیید حفظ checkpoint.
- اجرای Batch حداقل 100k فایل روی NTFS و ثبت Peak RSS/CPU و زمان.

این موارد تا زمانی که روی Windows واقعی Evidence تولید نکنند، در Release Readiness به‌عنوان Pending باقی می‌مانند.
