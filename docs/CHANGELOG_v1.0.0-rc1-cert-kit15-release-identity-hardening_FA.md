# Changelog — v1.0.0-rc1 cert-kit15

- Source Fingerprint به v2 ارتقا یافت و `package-lock.json` به‌صورت صریح از scope Source frozen خارج شد.
- Release Identity ترکیبی برای Source + lockfile + runtime pins + tooling/version اضافه شد.
- Windows preflight اکنون fingerprint قبل/بعد از lock resolution را مقایسه می‌کند.
- release manifest به `workspace-agent-release-v8` ارتقا یافت و `releaseIdentitySha256` اجباری شد.
- Certification report، Primary/Peer handoff، Final Envelope و Stable readiness به Release Identity bind شدند.
- تست‌های منفی برای lockfile-only mutation و source mutation اضافه شد.
- Core feature freeze بدون تغییر باقی ماند.
