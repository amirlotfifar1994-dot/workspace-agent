# Validation — v1.0.0-rc1 / cert-kit11 Windows Certification Execution Kit

این Validation در محیط Linux انجام شده و **ادعای Windows-certified ندارد**. هدف این مرحله بررسی Source، contractهای Execution Kit و جلوگیری از false PASS در Handoff/Finalization است.

## Source gates

- Full source regression: `81/81 PASS`
- RC1 cert-kit suite: `PASS`
- JS/CJS/MJS syntax: `212 files PASS`
- JSX/TS parse gate: `PASS`
- Source hygiene: `PASS`
- Dependency pins: `PASS`
- RC1 source contract: `PASS`, toolingRevision=`cert-kit11`
- Execution Handoff create/verify + tamper detection: `PASS`
- Manual Evidence prefill / NSIS hash binding: `PASS`
- Execution Kit static contract: `PASS`
- Stable promotion decision logic: `PASS`
- Windows-native UAT: `SKIP (Windows only)` در محیط فعلی
- Release input gate: `LOCKFILE_REQUIRED` تا زمان ساخت package-lock رسمی با Node 24.14.1 / npm 11.11.0 در Windows Release Lane

## نکات مهم

Execution Kit هیچ Result ویندوزی را جعل نمی‌کند. `Primary`, `Peer`, `Finalize` فقط روی Windows اجرا می‌شوند. Regressionهای non-Windows بررسی می‌کنند که transport manifest خراب reject شود، package-lock در Handoff بخشی از source identity باشد، Manual Evidence خودکار PASS نشود و تصمیم Stable بدون Final Verdict/Envelope معتبر `BLOCKED` بماند.

## Gateهای باقی‌مانده

Windows 10 + Windows 11، دو NTFS واقعی، Scale 100k + 1M، ACL/Junction/FileShare واقعی، USB disconnect/reconnect، Sleep/Resume، disk-full recovery، unclean shutdown، package-lock رسمی، npm ci، NSIS/Portable، upgrade واقعی 0.9.8→RC1 و Authenticode در صورت policy همچنان باید روی Windows واقعی اثبات شوند.
