# مدل Certification در v0.8.4

## هدف
Certification در این پروژه به معنی «گزارش قابل ممیزی از چیزی که واقعاً روی Windows اجرا شده» است، نه نام‌گذاری یک build به‌عنوان production-ready.

## لایه‌ها
1. **Source gate**: exact dependency pins، source hygiene، syntax، JSX، regression.
2. **Runtime gate**: Node/npm pin، Electron version، lifecycle marker، journal chain، SQLite health، resource pressure.
3. **Windows UAT**: UI Automation، NTFS index، long-path/Unicode/reparse، suspend/resume، removable volume، drive identity.
4. **Multi-root evidence**: دو location مجزا با `WA_CERT_ROOT_A/B`. بدون env، تست SKIP می‌شود و PASS جعلی تولید نمی‌کند.
5. **Packaged gate**: `win-unpacked`، worker از `app.asar.unpacked`، bootstrap واقعی executable در userData موقت.
6. **Artifact gate**: SHA-256 و Authenticode برای NSIS/Portable.

## Lifecycle
`runtime/lifecycle.json` در شروع session با `cleanExit=false` به‌صورت atomic نوشته می‌شود و heartbeat دارد. فقط در `will-quit` به `cleanExit=true` تبدیل می‌شود. Force-kill/power-loss بنابراین session قبلی را unclean باقی می‌گذارد.

در Startup پس از unclean session:
- Interrupted Cycleها reconcile می‌شوند.
- SQLite integrity check عمیق اجرا می‌شود.
- watcher roots با `UNCLEAN_SHUTDOWN_GAP` dirty می‌شوند.
- هیچ Write recovery خودکار اجرا نمی‌شود.

## Resource Pressure
Resource Pressure Guard از این سیگنال‌ها استفاده می‌کند:
- free memory ratio
- event-loop p95 delay
- process CPU share نسبت به تعداد logical core

حالت‌ها: `normal`, `warn`, `critical`.

اثر فقط روی budget است:
- `warn`: chunk تقریباً 50% و hash concurrency حداکثر 2.
- `critical`: chunk تقریباً 25% و hash concurrency 1.

Agent در فشار سیستم correctness را پایین نمی‌آورد و فایل را skip/delete نمی‌کند.

## Packaged smoke
Executable ساخته‌شده با پارامترهای زیر اجرا می‌شود:
- `--cert-smoke-output=<json>`
- `--cert-user-data=<isolated-dir>`

گزارش شامل app/Electron/Node، lifecycle، SQLite health، root resilience، watcher، journal و pressure است. سپس app تمیز خارج می‌شود.

## مرز شواهد
Harness هرگز power-off یا hard reset سیستم کاربر را خودکار انجام نمی‌دهد. «Actual hard power-loss» باید جداگانه و کنترل‌شده ثبت شود و در گزارش پیش‌فرض `PENDING_MANUAL` است.
