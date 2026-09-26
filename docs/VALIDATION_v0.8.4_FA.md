# Validation v0.8.4

## PASS در محیط توسعه فعلی
- exact dependency pins
- source hygiene
- Node syntax
- JSX parse/type pass
- تمام regressionهای v0.3 تا v0.8.3
- forced child-process kill → next session detects unclean shutdown
- clean exit → next session does not report unclean
- Resource Pressure normal/warn/critical policy
- pressure-aware Persistent Index chunk sizing
- pressure-aware duplicate hash concurrency
- RootResilience multi-root isolation
- Persistent SQLite multi-root isolation
- SQLite deep health after isolation test

## Fail-closed مورد انتظار
`npm run check:release-inputs` بدون lockfile واقعی: `LOCKFILE_REQUIRED`.

## غیرقابل اجرا در این محیط
- Windows UIA real UAT
- physical suspend/resume evidence
- removable drive physical disconnect/reconnect
- two physical volume UAT مگر روی Windows با `WA_CERT_ROOT_A/B`
- win-unpacked/NSIS/Portable
- packaged executable smoke
- Authenticode verification
- actual hard power-loss evidence

## Build
`npm run build` در این محیط به‌علت نصب نبودن `node_modules/vite` اجرا نشد (`vite: not found`). این مورد به‌عنوان PASS ثبت نشده است.

## Benchmark synthetic در محیط فعلی
- 100,000 metadata rows: build 5,376 ms، search 188 ms، duplicate candidate 89 ms، RSS 67 MB، heap 7 MB، DB 98 MB.
- 500,000 metadata rows: build 26,522 ms، search 541 ms، duplicate candidate 150 ms، RSS 100 MB، heap 8 MB، DB 493 MB.
- اجرای ترکیبی 1,000,000 در سقف زمانی ابزار متوقف شد؛ عدد 1M برای این نسخه گزارش نشده و در Windows scale UAT باقی مانده است.
