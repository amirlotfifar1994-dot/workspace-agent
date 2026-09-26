# Changelog — v1.0.0-rc1 cert-kit21 Handoff Transport Trust

- Handoff schema به v3 ارتقا یافت و Pointer references semantic containment گرفت.
- untrusted Handoff ZIP با bounded safe extractor استخراج می‌شود؛ raw Expand-Archive حذف شد.
- incoming package-lock قبل از هر Source mutation در staging verify و به Release Identity bind می‌شود.
- lock import پس از PASS کامل، staged و atomic است.
- ExecutionRoot با lexical + projected-realpath isolation کنترل می‌شود.
- Safe-Handoff Windows UAT به certification lane اضافه شد.
- Stable policy consistency برای NoBuildArtifacts، Signing و direct RunScale/BuildArtifacts سخت شد.
- Feature جدیدی به Core اضافه نشد؛ Feature Freeze برقرار است.
