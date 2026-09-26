# Changelog — v1.0.0-rc1 / cert-kit2

این revision همچنان Feature Freeze را حفظ می‌کند و هیچ قابلیت Core جدیدی اضافه نمی‌کند. هدف فقط بستن خلأهای Release/Certification کشف‌شده در cert-kit1 است.

## خلأهای بسته‌شده

- **Dual-Windows matrix:** یک Run روی یک Windows دیگر نمی‌تواند به‌تنهایی Final PASS بدهد. Envelope نهایی در صورت نبود Report خانواده دوم Windows، `INCOMPLETE` می‌ماند.
- **Scale matrix واقعی:** برای RC1، اجرای `-RunScale` اکنون هر دو سناریوی `100k` و `1M` فایل را به‌عنوان Gate اجباری اجرا می‌کند.
- **Stale artifact protection:** قبل از build certification، پوشه `release/` پاک می‌شود تا artifact قدیمی نتواند به‌جای خروجی Run فعلی تأیید شود.
- **Session isolation:** مسیر Certification با timestamp میلی‌ثانیه + PID ساخته می‌شود و Orchestrator فقط Report همان Session را می‌خواند.
- **Lockfile binding:** SHA256 واقعی `package-lock.json` داخل Windows certification report ثبت و در Envelope با Source/Release Manifest تطبیق داده می‌شود.
- **Release manifest binding:** Version، tooling revision، feature freeze، source fingerprint و lock hash همگی در Envelope cross-check می‌شوند.
- **INCOMPLETE semantics:** گزارش Certification ناقص دیگر توسط Envelope به‌اشتباه به `FAIL` تبدیل نمی‌شود؛ prerequisite ناقص همان `INCOMPLETE` باقی می‌ماند.
- **Manual evidence provenance:** operator، machine، timestamp و توضیح/attachment برای PASS اجباری شده‌اند.
- **Real upgrade evidence:** ارتقای واقعی `0.9.8 → 1.0.0-rc1` به Manual Evidence اجباری اضافه شد.
- **Source gate coverage:** syntax check و regression runner از لیست دستی به discovery خودکار همه فایل‌های مربوطه تغییر کرد.

## تغییر نکرد

- Version = `1.0.0-rc1`
- Data Epoch = `1`
- App ID = `com.workspaceagent.windows`
- Core Feature Freeze = فعال
- File Engine / UIA / Local AI / Grounding / Skill behavior = بدون تغییر
