# Validation v0.8.1

تاریخ Validation: 2026-08-13

## Automated regression
`npm run check` PASS شد:
- Syntax: PASS
- JSX/TS parser: PASS
- Regression suiteهای v0.3 تا v0.8.0: PASS
- `production-hardening-v081.test.cjs`: PASS
- `persistent-index-crash-v081.test.cjs`: PASS

Skill Registry پس از تغییر: 24 Skill؛ Write Skillها همچنان 6 مورد و Confirmation policy قبلی حفظ شده است.

## Event-storm test
ورودی مصنوعی: 5,160 event.
- Coalesced: 4,960
- Delivery backpressure drop: 140
- Delivered/reconciled در consumer کند آزمایشی: 60
- Pending نهایی: 0
- Dirty-root detection: PASS
- Clear-dirty بعد از Full-rescan-equivalent gate: PASS در service test

هدف این تست اثبات «عدم رشد بدون سقف» است، نه تضمین تحویل همه eventها؛ در drop، Root عمداً Dirty می‌شود.

## Crash-kill test
- child process وسط Full Scan با `SIGKILL` متوقف شد.
- SQLite توسط Process جدید باز شد.
- scan_queue پس از Crash باقی بود.
- Resume در 2 loop تکمیل شد.
- 2,800 فایل نهایی ثبت شد.
- SQLite health بعد از Resume: PASS.

## Persistent scale benchmark
Synthetic metadata rows:

| Rows | Build | Search | Duplicate candidate | RSS | Heap | DB |
|---:|---:|---:|---:|---:|---:|---:|
| 100,000 | 2,459 ms | 143 ms | 64 ms | 66 MB | 7 MB | 98 MB |
| 500,000 | 12,066 ms | 391 ms | 103 ms | 100 MB | 8 MB | 493 MB |
| 1,000,000 | 18,064 ms | 746 ms | 163 ms | 102 MB | 8 MB | 987 MB |

این benchmark metadata مصنوعی است و معادل زمان اسکن NTFS واقعی نیست؛ برای سنجش رفتار DB/RAM استفاده می‌شود.

## Windows-only UAT
`tests/windows-production-v081.uat.cjs` در Runtime غیر-Windows به‌درستی SKIP شد. روی Windows باید موارد زیر را validate کند:
- Full Persistent Scan.
- SQLite health.
- Worker-thread indexed duplicate.
- fs.watch burst.
- add/rename/delete reconcile.
- maintenance.

## Build
`npm run build` در محیط فعلی اجرا شد ولی با `vite: not found` متوقف شد چون `node_modules` نصب نیست. این خطا قبل از Vite source compilation رخ داده است. Binary/NSIS/Portable هنوز UAT نشده‌اند.
