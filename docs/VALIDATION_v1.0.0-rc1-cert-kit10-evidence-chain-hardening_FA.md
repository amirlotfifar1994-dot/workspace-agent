# Validation — v1.0.0-rc1 / cert-kit10 Evidence-chain Hardening

Validation این بسته در محیط non-Windows انجام شده است و ادعای Windows-certified ندارد.

## Source gates

- Full source regression: `77/77 PASS`
- RC1 cert-kit suite: `PASS`
- JS/CJS/MJS syntax: `205 files PASS`
- JSX/TS parse gate: `PASS`
- Source hygiene: `PASS`
- Dependency pins: `PASS`
- RC1 source contract: `PASS`, toolingRevision=`cert-kit10`
- Evidence tamper regression: `PASS`
- Windows-native UAT: `SKIP (Windows only)` در محیط فعلی
- Release input gate: `LOCKFILE_REQUIRED` تا زمان ساخت package-lock رسمی با Node/npm release lane

## Regressionهای جدید

- Evidence Bundle creation/verification
- تغییر Gate log بعد از Bundle → detect و reject
- Final Envelope → reject روی current/peer evidence bundle خراب
- structured Windows-native UAT output contract
- native Junction و ACL inheritance test logic داخل Windows UAT
- peer evidence directory snapshot contract

## Gateهای خارج از این محیط

Windows 10 + Windows 11، دو NTFS واقعی، اجرای واقعی ACL/Junction UAT، USB disconnect/reconnect و drive-letter relocation، Sleep/Resume، disk-full recovery، unclean shutdown، Scale 100k/1M، package-lock رسمی با Node 24.14.1/npm 11.11.0، npm ci، NSIS/Portable، upgrade واقعی 0.9.8→RC1 و Authenticode در صورت policy همچنان باید روی Windows واقعی اثبات شوند.
