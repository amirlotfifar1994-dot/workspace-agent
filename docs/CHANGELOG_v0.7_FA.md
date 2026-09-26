# Changelog v0.7.0 — Production Hardening

## هدف نسخه
v0.7 روی اضافه‌کردن قابلیت‌های پراکنده تمرکز ندارد؛ هدف آن این است که عملیات Write موجود بعد از Crash/Restart قابل تشخیص، حسابرسی و بازیابی باشند و Agent برای استفاده طولانی‌مدت روی Windows رفتار قابل پیش‌بینی‌تری داشته باشد.

## Crash Recovery / File Transactions
- `TransactionStore` مستقل برای عملیات Write اضافه شد.
- قبل از تغییر فایل، Transaction Intent روی دیسک ثبت می‌شود.
- هر عملیات دارای Source / Destination / Staging / State است.
- Writeهای زیر به Transaction Store وصل شدند:
  - Bulk Rename
  - Recommendation Apply
  - Organize
  - Duplicate Quarantine
  - Maintenance Cleanup
- بعد از Restart، وضعیت واقعی Source/Staging/Destination دوباره بررسی می‌شود.
- Recovery هیچ Write خودکاری انجام نمی‌دهد؛ کاربر بین Resume / Rollback / Abandon انتخاب می‌کند.
- حالت‌های مبهم به `manual-review` می‌روند.
- اگر فایل‌ها Commit شده باشند اما parent Cycle به‌علت Crash interrupted مانده باشد، Transaction برای reconcile state محلی همچنان در Recovery Center ظاهر می‌شود.
- Recovery علاوه بر وجود Path، Size/Type مورد انتظار را نیز کنترل می‌کند.

## Event Journal
- Journal append-only با فرمت NDJSON اضافه شد.
- هر Event دارای `prevHash` و SHA-256 hash است.
- Cycle create/run/checkpoint/confirmation/finalize/rollback ثبت می‌شوند.
- Transaction/Recovery/Watcher/Config events نیز ثبت می‌شوند.
- Integrity فایل فعال Journal قابل Verify است.

## Cycle Restart Truth
- Cycleهایی که هنگام Process Restart در وضعیت `running` مانده‌اند، `interrupted` ثبت می‌شوند.
- Agent آن‌ها را completed فرض نمی‌کند.
- برای Writeهای ناتمام، کاربر به Recovery Center ارجاع داده می‌شود.

## File Watcher
- Watch Root اختیاری با `fs.watch` و debounce اضافه شد.
- Event history محلی و محدود نگه داشته می‌شود.
- Watcher فقط Read-only event watch است و به‌تنهایی Cleanup/Move/Rename را اجرا نمی‌کند.

## PDF Base Intelligence
- Metadata: Title/Author/Subject/Creator/Producer.
- Page count تخمینی از Page objects.
- استخراج متن پایه از `Tj/TJ` در streamهای معمولی و FlateDecode.
- PDF رمزگذاری‌شده فقط Metadata/وضعیت را گزارش می‌کند.
- OCR وجود ندارد و encoding/font mappingهای پیچیده ممکن است متن کامل تولید نکنند.
- PDF به Near-duplicate Text pipeline نیز اضافه شد.

## Settings Portability
- Export/Import برای:
  - Automation Rules
  - Managed Zones
  - File Watch Roots
- فایل‌های Workspace یا Secretها داخل Bundle قرار نمی‌گیرند.
- Import به‌صورت merge انجام می‌شود و موارد نامعتبر/تکراری skip می‌شوند.

## UI
- Recovery Center
- Event Journal viewer + integrity state
- File Watcher panel
- PDF Intelligence panel
- Backup / Settings panel
- Version UI به v0.7.0 و Cycle Engine v4 ارتقا یافت.

## Scale benchmark
Synthetic in-memory dataset:
- 100k: search ~78 ms, RSS ~132 MB
- 500k: search ~436 ms, RSS ~347 MB
- 1M: search ~960 ms, RSS ~682 MB

نتیجه: الگوریتم جست‌وجوی فعلی روی 1M رکورد کار می‌کند، اما مدل نگه‌داری کامل Index در RAM برای درایوهای بسیار بزرگ بهینه نیست. v0.8 باید persistent/streaming index را هدف بگیرد.
