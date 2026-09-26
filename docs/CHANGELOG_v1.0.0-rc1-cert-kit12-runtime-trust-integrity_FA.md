# Changelog — v1.0.0-rc1 / cert-kit12 Runtime Trust & Integrity

- `toolingRevision` از cert-kit11 به cert-kit12 ارتقا یافت؛ Feature Freeze حفظ شد.
- Renderer trust از broad `file://`/localhost trust به exact production entry / exact dev origin محدود شد.
- packaged app دیگر `VITE_DEV_SERVER_URL` را قبول نمی‌کند.
- navigation/redirect/new-window/webview/renderer-permission fences اضافه شد.
- CSP اضافه شد و IPC `open-path` فقط directory را باز می‌کند.
- config-import/restore selection tokenها TTL/pruning دارند و config token از CSPRNG استفاده می‌کند.
- `durable-state.cjs` برای atomic+fsync sync/async اضافه شد و state storeهای اصلی به آن منتقل شدند.
- Event journal rotation chain حفظ می‌شود، archive tamper verify می‌شود و torn tail recovery محدود و audit‌شده است.
- Persistent hash cache schema v3 با `ctime_ms` اضافه شد.
- SemVer update guard strict و end-anchored شد.
- regressionهای جدید: runtime trust boundary، journal durability، durable state و hash-cache freshness.
- Windows Certification Execution Kit cert-kit11 حفظ شده ولی تمام artifact/evidenceهای جدید باید toolingRevision=cert-kit12 داشته باشند.
