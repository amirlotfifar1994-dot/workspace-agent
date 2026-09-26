# Validation — v1.0.0-rc1 / cert-kit12

Environment این validation: Linux container، Node v22.16.0 / npm 10.9.2. این Runtime رسمی Release نیست.

## Source gates
- Runtime trust/integrity suite: PASS
- RC1 cert-kit suite: PASS
- Syntax: PASS (218 JS/CJS/MJS files)
- JSX: PASS
- Source Hygiene: PASS
- Dependency Pins: PASS
- RC1 Source Contract: PASS / toolingRevision=cert-kit12

## Regression
تعداد فایل‌های `*.test.cjs`: 85.
به‌دلیل سقف زمانی اجرای container، کل suite در یک process واحد به پایان نرسید؛ اجرای sequential اصلی بدون Failure تا تست 63 پیش رفت و سپس تست‌های 64 تا 85 در اجرای مستقل **22/22 PASS** شدند. بنابراین هر 85 test file روی همین Source revision PASS شده‌اند، ولی این سند آن را به‌صورت «یک اجرای پیوسته 85/85» جا نمی‌زند.

## Windows-only truth
Windows-native UAT و Release artifacts در این محیط تولید/تأیید نشده‌اند. `package-lock.json` رسمی همچنان باید در Runtime pinشده ساخته شود. Stable/Windows Certified اعلام نمی‌شود.
