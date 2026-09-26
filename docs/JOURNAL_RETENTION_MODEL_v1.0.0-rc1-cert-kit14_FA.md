# Journal Retention Model — v1.0.0-rc1 / cert-kit14

## مسئله
Rotation قبلی tamper-evident بود، اما archiveهای `events-*.ndjson` سقف نداشتند و در استفاده طولانی می‌توانستند بدون bound رشد کنند.

## مدل جدید
- سقف عادی: حداکثر 64 archive و 512 MiB archive data.
- زیر disk pressure: سقف پیش‌فرض به 8 archive و 128 MiB کاهش می‌یابد.
- حداقل یک archive نگه داشته می‌شود؛ Active Journal هرگز توسط retention حذف نمی‌شود.
- قبل از prune کل chain verify می‌شود. اگر chain legacy/invalid باشد، prune انجام نمی‌شود.
- آخرین hash/seq حذف‌شده در `retention-anchor.json` با anchor hash ذخیره می‌شود و verify از همان checkpoint ادامه پیدا می‌کند.
- تعداد event/segment/byte حذف‌شده cumulative در anchor نگه‌داری می‌شود تا گزارش verify حقیقت retention را نشان دهد.

## Crash Safety
Retention یک `retention-intent.json` durable می‌نویسد. اگر process بین حذف archive و ثبت anchor crash کند، startup intent را roll-forward می‌کند و anchor را نهایی می‌سازد. Intent/Anchor نامعتبر به‌عنوان خطای integrity گزارش می‌شود.

## محدودیت امنیتی
این anchor یک local tamper-evidence mechanism است و جای signature خارجی/remote transparency log را نمی‌گیرد. Scope v1 حفظ chain محلی، جلوگیری از رشد نامحدود و recovery قابل‌تکرار است.
