# Changelog — v1.0.0-rc1 / cert-kit10 Evidence-chain Hardening

این revision همچنان Feature Freeze را حفظ می‌کند. تمرکز cert-kit10 روی قابل‌اعتماد بودن خود **Evidence مربوط به Windows Certification** است؛ یعنی PASS فقط به متن یک Report وابسته نباشد و لاگ‌ها/UATهای پشت آن نیز قابل دست‌کاری بی‌صدا نباشند.

## تغییرات اصلی

- `toolingRevision` از `cert-kit9` به `cert-kit10` ارتقا یافت.
- `certification-evidence-bundle.cjs` اضافه شد؛ همه‌ی log/json/txtهای Evidence داخل هر Windows certification session با bytes و SHA-256 ثبت و aggregate hash می‌شوند.
- `certification-report.json` به schema `workspace-agent-windows-certification-v5` ارتقا یافت و SHA-256/تعداد فایل/aggregate hash Evidence Bundle را bind می‌کند.
- Envelope اکنون Evidence Bundle هر دو Windows family را دوباره بازبینی می‌کند؛ تغییر حتی یک Gate log یا UAT result بعد از Certification باعث Final FAIL می‌شود.
- Gateهای npm/node اکنون علاوه بر path لاگ، `logBytes` و `logSha256` را داخل Report ثبت می‌کنند.
- Windows-native UAT به schema ساختاریافته v2 ارتقا یافت و نتیجه را از طریق `WA_CERT_RESULT` ثبت می‌کند؛ در strict mode نبود prerequisite دیگر PASS/skip خاموش محسوب نمی‌شود.
- UAT ویندوزی علاوه بر Unicode/long path/case-only/FileShare.None، حالا **junction واقعی NTFS** و **ACL inheritance واقعی** داخل workspace موقت را هم تست می‌کند.
- Peer Windows snapshot به‌جای کپی صرف Report، کل پوشه Evidence همان Run را snapshot می‌کند تا bundle و فایل‌های پشت آن کنار Report بمانند.
- Final verdict v2 metadata مربوط به Evidence Bundle هر دو OS را نیز نگه می‌دارد.
- Regression جدید برای tamper detection اضافه شد: تغییر Gate log بعد از ساخت Bundle باید توسط Bundle verifier و Final Envelope رد شود.

## اصل ایمنی

Harness همچنان روی مسیرهای موقت certification کار می‌کند و عملیات مخرب سیستم مثل Format/Initialize/Clear Disk/Restart خودکار انجام نمی‌دهد. ACL/Junction UAT فقط داخل workspace موقت ساخته‌شده زیر `WA_CERT_ROOT_A` انجام می‌شود.
