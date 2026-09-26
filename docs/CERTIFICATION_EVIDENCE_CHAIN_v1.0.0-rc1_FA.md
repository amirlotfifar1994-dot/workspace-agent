# مدل Evidence Chain — Workspace Agent v1.0.0-rc1 / cert-kit10

## مسئله

در cert-kit9، `certification-report.json` نتیجه Gateها را نگه می‌داشت؛ اما فایل‌های پشت Gateها مثل logها و structured UAT resultها به‌صورت محتوایی به Report bind نشده بودند. در نتیجه از نظر audit، امکان تغییر یک لاگ بعد از ساخته‌شدن Report بدون تغییر خود Report وجود داشت.

## مدل cert-kit10

هر Windows certification session پیش از ساخت Report یک `evidence-bundle.json` می‌سازد. Bundle برای هر Evidence file این موارد را ثبت می‌کند:

- مسیر نسبی داخل همان Session؛
- bytes؛
- SHA-256؛
- aggregate SHA-256 کل فهرست.

خود Report نیز SHA-256 و metadata Bundle را ثبت می‌کند؛ بنابراین Evidence ID گزارش به Bundle bind می‌شود.

## Final Envelope

Envelope برای Report جاری و Peer Report:

1. وجود Bundle کنار Report را اجباری می‌کند؛
2. SHA-256 خود Bundle را با declaration گزارش مقایسه می‌کند؛
3. تمام entryهای Bundle را دوباره hash می‌کند؛
4. bytes و aggregate hash را verify می‌کند؛
5. path escape و duplicate entry را رد می‌کند.

در نتیجه کپی کردن فقط `certification-report.json` برای Finalization کافی نیست؛ پوشه Evidence همان Run نیز باید همراه آن بماند.

## Windows-native UAT v2

Structured UAT شامل NTFS، Persian/Unicode/emoji، canonical collision، long path، case-only rename+undo، junction واقعی، ACL inheritance و FileShare.None lock است. نتیجه در فایل JSON مستقل ذخیره می‌شود و همان فایل داخل Evidence Bundle قرار می‌گیرد.

## چیزی که هنوز خودکار نیست

USB disconnect واقعی، disk-full واقعی، power-loss/unclean shutdown و upgrade واقعی از 0.9.8 همچنان Manual Evidence هستند؛ Harness این موارد را به‌صورت مخرب/خودکار ایجاد نمی‌کند.
