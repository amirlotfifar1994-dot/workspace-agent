# اعتبارسنجی v1.0.0-rc1 — cert-kit19 Certification Chain Closure

## Source validation

- `npm run check`: PASS
- Source tests: `103/103` PASS در یک اجرای کامل
- Syntax: `245` فایل PASS
- JSX: PASS
- Source Hygiene: PASS
- Dependency Pins + Dependency Source Policy: PASS
- RC1 Source Contract: PASS / cert-kit19
- `check:release-inputs` بدون lockfile رسمی: `LOCKFILE_REQUIRED` مطابق انتظار

## تست‌های جدید/تقویت‌شده

- Handoff symlink/reparse tamper rejection
- Pointer lexical + realpath containment
- dependency registry/git/file/link/http provenance rejection
- Release Identity dependency-policy binding
- Evidence Bundle v2: reparse + undeclared-file detection
- promotion-time Release/Manual/Primary/Peer leaf reverification
- Final Bundle static contract
- Dynamic Final Bundle end-to-end: build + independent verify + tamper rejection
- Recovery compatibility با layout واقعی Orchestrator و Evidence Bundle v2

## Windows-only probes در محیط فعلی

- Windows Native Edge UAT: `SKIP (Windows only)`
- Windows NTFS Metadata UAT: `SKIP (Windows only)`
- Windows Local AI Provenance UAT: `SKIP / WINDOWS_REQUIRED`

هیچ PASS ویندوزی از محیط Linux ادعا نشده است.

## مرز محیط validation

Validation حاضر روی Linux با Node `v22.16.0` و npm `10.9.2` انجام شده است. Release رسمی باید روی Windows lane با Node `24.14.1` و npm `11.11.0` انجام شود و package-lock رسمی فقط از registry مصوب ساخته شود.
