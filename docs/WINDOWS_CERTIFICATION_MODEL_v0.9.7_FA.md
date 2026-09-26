# Windows Certification Model — v0.9.7

## هدف

این نسخه بین «تست سورس» و «Windows-certified release» مرز سخت ایجاد می‌کند. خروجی UAT با exit code صفر ولی متن `SKIP` دیگر نمی‌تواند به PASS تبدیل شود.

## وضعیت Gate

- `PASS`: Gate واقعاً اجرا و موفق شده است.
- `FAIL`: Gate اجرا شده و شکست خورده است.
- `INCOMPLETE`: Gate اجباری اجرا نشده یا prerequisite ندارد.
- `SKIP`: Gate اختیاری عمداً اجرا نشده است.
- `PENDING_MANUAL`: شواهد دستی هنوز ثبت نشده‌اند.

Certification تنها وقتی PASS است که تمام Gateهای Required واقعاً PASS باشند.

## Unified two-volume UAT

`tests/windows-certification-v097.uat.cjs` به دو Root واقعی نیاز دارد. هر دو باید NTFS و دارای Volume UniqueId باشند. به‌صورت پیش‌فرض UniqueIdها باید متفاوت باشند.

UAT داخل زیرپوشه موقت خود:

1. فایل و پوشه Unicode می‌سازد.
2. Cross-volume Move را اجرا می‌کند.
3. SHA-256 و ساختار مقصد را Verify می‌کند.
4. duplicate-aware skip را Verify می‌کند.
5. Undo را اجرا و Source را Verify می‌کند.
6. Free-space و Volume identity را در evidence ثبت می‌کند.

هیچ داده خارج از پوشه UAT تغییر نمی‌کند.

## Scale

`tests/windows-scale-v097.uat.cjs` بین 10,000 تا 1,000,000 فایل واقعی می‌سازد، Persistent Index را کامل می‌کند و زمان fixture، scan، query، RSS/heap و DB size را ثبت می‌کند. اجرای 1M باید روی فضای آزمایشی اختصاصی انجام شود.

## Supply-chain

Official release نیازمند:

- exact top-level dependency pins؛
- `package-lock.json` واقعی؛
- lockfile root consistency؛
- integrity برای registry packageها؛
- `npm ci`؛
- Source Tree Fingerprint؛
- packaged worker/app smoke؛
- SHA256 artifactها؛
- Authenticode در صورت RequireSigning.

## Manual evidence

Harness عمداً USB را جدا، دیسک را پر، ACL را deny یا برق سیستم را قطع نمی‌کند. این موارد با template جدا ثبت می‌شوند. در حالت `-RequireManualEvidence` هر Pending موجب INCOMPLETE می‌شود.
