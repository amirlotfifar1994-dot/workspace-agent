# Changelog — v1.0.0-rc1 cert-kit14

- Local AI executable provenance: streaming SHA-256، mutation detection، Trust Policy و Windows Authenticode signer/thumbprint visibility/pinning.
- Pre-spawn fail-closed enforcement برای hash/signature mismatch.
- Event Journal bounded retention با retention anchor، durable intent و startup roll-forward recovery.
- Disk-pressure retention limits اضافه شد.
- v1 Automation contract به foreground-GUI و v1 Update contract به manual-verified تثبیت شد؛ بدون اضافه‌کردن feature محصولی جدید به RC.
- دو تست Source جدید برای Runtime provenance و Journal retention اضافه شد.
- در صورت corruption/tamper شدن retention anchor، verify همچنان fail می‌ماند اما retained tail معتبر برای ادامه hash-chain حفظ می‌شود و از reset اشتباه به `GENESIS` جلوگیری می‌شود.
