# اعتبارسنجی v1.0.0-rc1 — cert-kit17 Execution Recovery/Resume

## وضعیت Source

- Full source regression: `PASS_97_97_SINGLE_RUN`
- Syntax: `PASS_237_FILES`
- JSX: `PASS`
- Source hygiene: `PASS`
- Dependency pins: `PASS`
- RC1 source contract: `PASS_CERT_KIT17`
- RC1 execution suite: `PASS`
- RC1 certification-kit suite: `PASS`

## Hardening این مرحله

- Recovery/Resume محدود به مرزهای کامل و immutable است؛ UAT نیمه‌کاره reuse نمی‌شود.
- خروجی ناقص قبل از rerun به `recovery-invalidated/<timestamp>/` منتقل می‌شود.
- زنجیره‌ی state/history با canonical Node hashing تولید و دوباره محاسبه می‌شود؛ latest state نیز مستقل re-hash می‌شود.
- Primary/Peer می‌توانند `INCOMPLETE` مورد انتظارِ ناشی از evidence مرحله‌ی بعد را از failure واقعی جدا کنند.
- Primary فقط کمبود `DUAL_WINDOWS_EVIDENCE_REQUIRED` و `MANUAL_EVIDENCE_REQUIRED` را برای handoff مجاز می‌داند.
- Peer فقط `MANUAL_EVIDENCE_REQUIRED` را برای return مجاز می‌داند.
- Release manifest/evidence bundle/release identity قبل از reuse یا handoff دوباره verify می‌شوند.
- Finalize ورودی‌های Primary/Peer/Manual Evidence را قبل از ادامه در state ثبت می‌کند تا restart قابل ردیابی باشد.

## Release-input gate

در محیط اعتبارسنجی Linux، `npm run check:release-inputs` عمداً با `LOCKFILE_REQUIRED` متوقف شد. این نتیجه مورد انتظار است؛ `package-lock.json` رسمی نباید در این محیط جعل شود و باید در Windows Release Lane با Node `24.14.1` و npm `11.11.0` تولید/تأیید شود.

## محدودیت اعتبارسنجی

هیچ PASS برای Windows-only UAT در این محیط ادعا نمی‌شود. Windows 10/11 واقعی، دو NTFS volume، scale، USB، disk-full، power/sleep، packaging و upgrade evidence همچنان برای Stable لازم‌اند.
