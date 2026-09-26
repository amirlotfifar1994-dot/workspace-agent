# Changelog v0.8.2

## Windows path hardening
- `windows-path-utils.cjs` اضافه شد.
- long-path / UNC I/O با namespaced path پشتیبانی شد.
- Persistent Index، legacy indexer، watcher و path-policy به utility مشترک وصل شدند.
- namespace از DB/UI جدا نگه داشته شد.
- symlink/junction traversal در Scan/Hash محدود شد.
- duplicate hashing از `lstat` + before/after identity validation استفاده می‌کند.

## Packaged Worker
- `windows-path-utils.cjs` کنار `hash-worker.cjs` در `asarUnpack` قرار گرفت.
- `resolveWorkerScript()` تست‌پذیر شد.
- packaged worker smoke test اضافه شد.

## Reproducible release
- تمام top-level dependencyها exact pin شدند.
- Node/npm release lane pin شد (`.nvmrc`, `.node-version`, `packageManager`).
- `verify-release-inputs.cjs` اضافه شد.
- بدون `package-lock.json` Release رسمی Fail-closed است.
- `generate-lockfile.ps1` اضافه شد.
- Windows release فقط `npm ci` استفاده می‌کند.
- build `win-unpacked` و post-pack Worker smoke قبل از artifact نهایی اضافه شد.
- NSIS و Portable artifactName جدا شدند.
- Authenticode post-build verification اضافه شد.
- release manifest شامل package-lock SHA-256 و signature status شد.

## Supply-chain hygiene
- `verify-source-hygiene.cjs` اضافه شد.
- private-key/certificate-secret فایل‌های حساس، `.env*` و dynamic code executionهای مشخص Block می‌شوند.

## UAT/Test
- `windows-path-hardening-v082.test.cjs`.
- `windows-verification-v082.uat.cjs`.
- `packaged-worker-smoke-v082.cjs`.
- Regression قدیمی بدون حذف تست حفظ شد.
