# Validation — cert-kit16 Windows Execution Hardening

## Source-side validation

این revision باید در محیط Source با موارد زیر بررسی شود:

- `npm run check:dependency-pins`
- `npm run check:rc1-source`
- `npm run check:source-hygiene`
- `npm run check:syntax`
- `npm run check:jsx`
- full source tests
- fingerprint consistency
- fresh-extract revalidation

تست‌های جدید:

- `rc1-windows-doctor-contract.test.cjs`
- `rc1-execution-traceability-hardening.test.cjs`

## Windows-only validation باقی‌مانده

در محیط غیر Windows هیچ PASS برای Doctor یا Windows UAT ادعا نمی‌شود. قبل از Stable باید حداقل:

- Doctor روی Windows 10 و Windows 11 واقعی PASS شود؛
- Primary/Peer روی دو خانواده Windows اجرا شوند؛
- دو Volume واقعی NTFS و Scale 100k + 1M اثبات شوند؛
- Junction/ACL/share-mode lock/metadata fidelity، removable drive، sleep/resume، disk-full و unclean shutdown evidence تکمیل شود؛
- NSIS/Portable ساخته و hash/signing policy verify شود؛
- upgrade واقعی 0.9.8 → RC1 با همان Primary NSIS ثبت شود.
