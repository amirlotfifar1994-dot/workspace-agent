# Changelog — v1.0.0-rc1 / cert-kit1

این revision فقط Release/Certification tooling را تغییر می‌دهد و Core/State SemVer همان `1.0.0-rc1` باقی مانده است.

## افزوده شد

- `scripts/windows-rc1-certify.ps1`: Orchestrator یک‌مرحله‌ای Windows Certification.
- `scripts/rc1-certification-envelope.cjs`: زنجیره integrity بین source fingerprint، lockfile، certification report و artifactها.
- `scripts/verify-manual-evidence-rc1.cjs`: Manual Evidence نسخه‌دار برای RC1.
- `docs/MANUAL_CERTIFICATION_EVIDENCE_RC1.template.json`.
- `docs/RC1_WINDOWS_CERTIFICATION_KIT_FA.md`.
- `docs/RC1_CERTIFICATION_ENVELOPE_FA.md`.
- تست‌های contract برای non-destructive harness، envelope و evidence.

## اصلاح شد

- Source Fingerprint دیگر `dist/` و تمام پوشه‌های `certification-*` را به‌عنوان ورودی سورس حساب نمی‌کند.
- `package-lock.json` همچنان عمداً در fingerprint باقی می‌ماند.
- Release/Certification manifestها `toolingRevision` و Feature Freeze را ثبت می‌کنند.
- Windows release/certification برای RC1 از verifier مخصوص Manual Evidence RC1 استفاده می‌کند.
- Required SKIP/INCOMPLETE در Orchestrator به PASS تبدیل نمی‌شود.

## تغییر نکرد

- Data Epoch = 1.
- App ID.
- Core File Engine / UIA / Local AI / Grounding behavior.
- Skill Registry behavior.
- Safety/confirmation/write gates.
