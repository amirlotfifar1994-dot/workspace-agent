# اعتبارسنجی v1.0.0-rc1 — cert-kit18 Final Evidence Provenance

## Source validation

- `npm run check`: PASS
- Source tests: `98/98` PASS در یک اجرای کامل
- Syntax: `238` فایل PASS
- JSX: PASS
- Source Hygiene: PASS
- Dependency Pins: PASS
- RC1 Source Contract: PASS / cert-kit18
- Release Input Gate بدون lockfile رسمی: `LOCKFILE_REQUIRED` مطابق انتظار

## تست‌های جدید/تقویت‌شده

- Manual Evidence v3 execution/release binding
- cross-run mismatch rejection
- Release Identity mismatch rejection
- attachment SHA/bytes verification و tamper rejection
- Finalizer handoff/pointer binding contract
- Stable decision execution binding
- Promotion-time Verdict input re-hash contract
- self-contained Manual Evidence attachment packaging contract

## مرز محیط validation

Validation حاضر روی Linux با Node `v22.16.0` و npm `10.9.2` انجام شده است. این محیط جای Release Runtime رسمی را نمی‌گیرد. Release رسمی همچنان باید روی Windows lane با Node `24.14.1` و npm `11.11.0` انجام شود.

Windows-only UAT در این محیط PASS ادعا نشده است.
