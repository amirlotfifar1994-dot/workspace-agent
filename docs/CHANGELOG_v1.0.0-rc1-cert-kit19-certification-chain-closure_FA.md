# Changelog — v1.0.0-rc1 cert-kit19

- Handoff Manifest v2 با symlink/reparse/special-file/realpath fail-closed policy.
- Source Fingerprint traversal نیز link/special file را fail-closed می‌کند.
- Dependency Source Policy allowlist برای registry.npmjs.org و HTTPS-only resolution.
- package-lock provenance v2 و Release Identity v2 با dependency-policy binding.
- Release Manifest schema v9 با dependency policy hash و resolved registry origins.
- Windows lock/release/certification lane با npm registry pin صریح.
- Certification Evidence Bundle v2 با path-policy و detection فایل undeclared/reparse.
- Promotion-time leaf reverification برای Release artifacts، Authenticode، Manual attachments و هر دو Evidence Bundle.
- Final Verdict schema v4 و Stable Promotion Decision schema v3.
- Self-contained Final Certification Bundle v1 با Frozen Source + exact lockfile + Primary/Peer Handoff + Manual attachments + independent bundle manifest.
- Recovery برای Final Bundle کامل نیز reverify انجام می‌دهد.
- تست dynamic end-to-end برای ساخت/verify/tamper Final Bundle اضافه شد.
- Core Feature Freeze بدون تغییر باقی مانده است.
